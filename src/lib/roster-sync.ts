import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { generateText, isStepCount, tool, type LanguageModel } from "ai";
import { getDomain } from "tldts";
import { z } from "zod";

import { createAiModel } from "./ai-model.ts";
import { env } from "./env.ts";
import type { CompanionRecord } from "./parser.ts";
import { normalizeSpecies } from "./species.ts";
import { DOCUMENT_SEPARATOR, parseCompanionRoster } from "./parser.ts";
import { prisma } from "./prisma.ts";
import { isPublicHttpUrl } from "./public-http-url.ts";
import { revalidatePublicRoster } from "./public-roster-cache.ts";
import { normalizeSourceUrl } from "./source-url.ts";

export type SyncSummary = {
  created: number;
  updated: number;
  adopted: number;
  madeUnavailable: number;
  madeAvailable: number;
  usedFallbackCapture: boolean;
  rosterComplete: boolean;
  rosterCompleteness: RosterCompleteness;
  source: string;
};

export type RosterCompleteness = {
  complete: boolean;
  timedOut: boolean;
  status: string;
  completed: number;
  total: number;
};

const DEFAULT_CAPTURE = "dogs-page-A.html";
const MAX_FIRECRAWL_CRAWL_PAGES = 100;
const MAX_FIRECRAWL_DISCOVERY_DEPTH = 3;
// Firecrawl queues pages behind a per-plan browser concurrency cap, so a
// hundred-page crawl routinely needs more than a minute; the drain route grants
// each sync 240s and a discovery rarely runs more than two crawls.
const FIRECRAWL_CRAWL_TIMEOUT_MS = 90_000;
const FIRECRAWL_POLL_INTERVAL_MS = 1_000;
const MAX_ROSTER_AGENT_STEPS = 10;
const MAX_ROSTER_TOOL_CALLS = 12;
// A batch scrape names up to MAX_BATCH_SCRAPE_URLS full URLs in one tool call,
// so the model needs room for several thousand output tokens in a step.
const MAX_ROSTER_OUTPUT_TOKENS = 8_000;
const MAX_BATCH_SCRAPE_URLS = 100;
const MAX_SCRAPE_LINKS = 300;
const MAX_SCRAPE_DATA_ENDPOINTS = 300;
const MAX_SCRAPE_MARKDOWN_CHARS = 20_000;
const MAX_FIRECRAWL_LOAD_MORE_CLICKS = 10;
const FIRECRAWL_LOAD_MORE_WAIT_MS = 500;
const MAX_SYNC_NOTE_CHARS = 4_000;
const MAX_CRAWL_SUMMARY_CHARS = 4_000;
// A live scrape should never make most of the current roster disappear at once.
// Require a human to investigate instead of marking all of them unavailable.
const MAX_LIVE_UNAVAILABLE_FRACTION = 0.5;
const RESIDENT_WRITE_BATCH_SIZE = 25;

export class RosterSyncRefusal extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "RosterSyncRefusal";
    this.reason = reason;
  }
}

type SyncRosterOptions = {
  signal?: AbortSignal;
};

type RetiredResident = { id: string; name: string; photoUrls: string[] };

export async function syncRoster(
  orgId: string,
  options: SyncRosterOptions = {},
): Promise<SyncSummary> {
  options.signal?.throwIfAborted();
  const settings = await prisma.rescueSettings.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  });
  options.signal?.throwIfAborted();
  if (!settings.sourceUrl) {
    throw new Error("Roster sync needs an adoption-page source URL; save one in staff settings first");
  }
  const sourceUrl = settings.sourceUrl;
  const priorNote = await prisma.rosterSyncNote.findUnique({
    where: { orgId_sourceUrl: { orgId, sourceUrl } },
    select: { notes: true },
  });
  options.signal?.throwIfAborted();
  const {
    text,
    usedFallbackCapture,
    rosterComplete,
    rosterCompleteness,
    source,
    documents,
  } = await loadRoster(sourceUrl, {
    signal: options.signal,
    priorNotes: priorNote?.notes ?? null,
    saveNotes: async (notes) => {
      await saveRosterSyncNote(prisma, orgId, sourceUrl, notes);
    },
  });
  options.signal?.throwIfAborted();
  const companions = onlyIdentifyingSourceUrls(
    await parseRosterDocuments(documents ?? [{ text, sourceUrl: source }], options.signal),
  );
  options.signal?.throwIfAborted();

  if (companions.length === 0) {
    throw new Error("Roster sync refused to mark every resident unavailable after parsing an empty roster");
  }

  const summary = await prisma.$transaction(async (tx) => {
    options.signal?.throwIfAborted();
    const before = await tx.resident.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        sourceUrl: true,
        photoUrls: true,
        available: true,
        unavailabilityReason: true,
      },
    });
    const existingNames = new Set(before.map((resident) => resident.name));
    const existingSourceUrls = new Set(before.map((resident) => resident.sourceUrl).filter(Boolean));
    const { adoptedCandidates, unavailableCandidates, availableCandidates } = planRosterAvailabilityChanges(
      before,
      companions,
      { usedFallbackCapture, rosterComplete },
    );

    assertPlausibleUnavailableCount(
      before.filter((resident) => resident.available).length,
      adoptedCandidates.length + unavailableCandidates.length,
      usedFallbackCapture || !rosterComplete,
    );

    await upsertCompanions(
      tx,
      orgId,
      companions,
      !usedFallbackCapture && rosterComplete,
      options.signal,
    );

    for (const resident of adoptedCandidates) {
      options.signal?.throwIfAborted();
      await markResidentAdopted(tx, orgId, resident);
    }
    for (const resident of unavailableCandidates) {
      options.signal?.throwIfAborted();
      await markResidentUnavailable(tx, orgId, resident);
    }

    return {
      created: companions.filter((companion) => !existingNames.has(companion.name)
        && !existingSourceUrls.has(normalizeSourceUrl(companion.sourceUrl ?? ""))).length,
      updated: companions.filter((companion) => existingNames.has(companion.name)
        || existingSourceUrls.has(normalizeSourceUrl(companion.sourceUrl ?? ""))).length,
      adopted: adoptedCandidates.length,
      madeUnavailable: unavailableCandidates.length,
      madeAvailable: availableCandidates.length,
      usedFallbackCapture,
      rosterComplete,
      rosterCompleteness,
      source,
    };
  }, { maxWait: 10_000, timeout: 60_000 });
  revalidatePublicRoster();
  return summary;
}

/**
 * An explicit Adopted marker or a staff decision: the resident leaves the
 * roster and each active sponsorship gets an editable adoption notice draft.
 * Sponsorship state and billing do not change until staff approve the notice.
 */
export async function markResidentAdopted(
  tx: SyncTransaction,
  orgId: string,
  resident: RetiredResident,
) {
  return retireResident(tx, orgId, resident, "adopted");
}

/**
 * Absence from a complete live roster: the resident leaves the roster and each
 * active sponsorship gets a notice explaining that the companion left.
 */
export async function markResidentUnavailable(
  tx: SyncTransaction,
  orgId: string,
  resident: RetiredResident,
) {
  return retireResident(tx, orgId, resident, "unavailable");
}

async function retireResident(
  tx: SyncTransaction,
  orgId: string,
  resident: RetiredResident,
  unavailabilityReason: "adopted" | "unavailable",
) {
  await tx.resident.update({
    where: { id_orgId: { id: resident.id, orgId } },
    data: { available: false, unavailabilityReason },
  });

  const [sponsorships, latestPhoto] = await Promise.all([
    tx.sponsorship.findMany({
      where: { residentId: resident.id, orgId, status: "active" },
      select: {
        id: true,
        sponsor: { select: { name: true } },
      },
    }),
    tx.volunteerPhoto.findFirst({
      where: { residentId: resident.id, orgId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { url: true, webUrl: true },
    }),
  ]);
  const heroPhotoUrl = latestPhoto?.webUrl ?? latestPhoto?.url ?? resident.photoUrls[0] ?? null;

  for (const sponsorship of sponsorships) {
    await tx.sponsorUpdate.create({
      data: {
        ...adoptionDraft(
          resident.id,
          sponsorship.id,
          resident.name,
          sponsorship.sponsor.name,
          unavailabilityReason,
          heroPhotoUrl,
        ),
        orgId,
      },
    });
  }

  return sponsorships.length;
}

type ResidentAvailabilitySnapshot = {
  id: string;
  name: string;
  sourceUrl?: string;
  available: boolean;
  unavailabilityReason?: "adopted" | "unavailable" | null;
};

export function planRosterAvailabilityChanges<T extends ResidentAvailabilitySnapshot>(
  before: T[],
  companions: CompanionRecord[],
  source: Pick<RosterSource, "usedFallbackCapture" | "rosterComplete">,
) {
  const onRoster = (resident: T) => companions.some((companion) => companionMatchesResident(companion, resident));
  const explicitlyMarked = (resident: T) => companions.some(
    (companion) => companion.adopted && companionMatchesResident(companion, resident),
  );
  const absenceIsReliable = !source.usedFallbackCapture && source.rosterComplete;

  // An explicit Adopted marker is the only evidence of an adoption; it is
  // honored even on partial crawls and checked-in fallback captures.
  const adoptedCandidates = before.filter(
    (resident) => resident.available && explicitlyMarked(resident),
  );

  // Absence only proves unavailability after a complete read of the configured
  // source, and says nothing about why the companion left.
  const unavailableCandidates = before.filter(
    (resident) => resident.available
      && !explicitlyMarked(resident)
      && absenceIsReliable
      && !onRoster(resident),
  );

  // Restoration uses the same evidence standard: only a complete live roster
  // proves that an unmarked resident should be available again.
  const availableCandidates = absenceIsReliable ? before.filter(
    (resident) => !resident.available
      && resident.unavailabilityReason !== "adopted"
      && onRoster(resident)
      && !explicitlyMarked(resident),
  ) : [];

  return { adoptedCandidates, unavailableCandidates, availableCandidates };
}

function companionMatchesResident(companion: CompanionRecord, resident: ResidentAvailabilitySnapshot): boolean {
  const sourceUrl = normalizeSourceUrl(companion.sourceUrl ?? "");
  return sourceUrl && resident.sourceUrl
    ? sourceUrl === resident.sourceUrl
    : companion.name === resident.name;
}

export function assertPlausibleUnavailableCount(
  availableResidents: number,
  unavailableCandidates: number,
  usedFallbackCapture: boolean,
) {
  // A bundled capture only marks companions carrying an explicit Adopted marker,
  // so preserve that intentionally conservative fallback behavior.
  if (usedFallbackCapture || availableResidents === 0) return;

  if (unavailableCandidates / availableResidents > MAX_LIVE_UNAVAILABLE_FRACTION) {
    throw new RosterSyncRefusal(
      `The parsed roster would mark ${unavailableCandidates} of ${availableResidents} available residents unavailable. Please verify the roster source and try again.`,
    );
  }
}

export type SyncTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function saveRosterSyncNote(
  store: Pick<typeof prisma, "rosterSyncNote">,
  orgId: string,
  sourceUrl: string,
  notes: string,
) {
  await store.rosterSyncNote.upsert({
    where: { orgId_sourceUrl: { orgId, sourceUrl } },
    create: { orgId, sourceUrl, notes },
    update: { notes, createdAt: new Date() },
  });
}

/**
 * Parses each gathered page on its own so a companion keeps the URL of the page
 * it came from. The parser already batches and bounds its own model calls, so
 * pages are parsed a few at a time rather than all at once.
 */
const ROSTER_DOCUMENT_CONCURRENCY = 4;

async function parseRosterDocuments(
  documents: RosterDocument[],
  signal?: AbortSignal,
): Promise<CompanionRecord[]> {
  const parsed: CompanionRecord[][] = new Array(documents.length);
  let next = 0;
  const worker = async () => {
    while (next < documents.length) {
      signal?.throwIfAborted();
      const index = next++;
      const document = documents[index];
      parsed[index] = (await parseCompanionRoster(document.text)).map((companion) => ({
        ...companion,
        // A listing remains the source when discovery did not yield a detail page.
        sourceUrl: normalizeSourceUrl(document.sourceUrl),
      }));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(ROSTER_DOCUMENT_CONCURRENCY, documents.length) }, worker),
  );
  return parsed.flat();
}

/**
 * A source URL identifies one companion, so only a page that yielded exactly one
 * companion can name it. A listing that yielded several leaves all of them
 * unidentified instead of colliding on the unique (orgId, sourceUrl) index and
 * folding a whole roster into the first resident that claimed the page.
 */
export function onlyIdentifyingSourceUrls(companions: CompanionRecord[]): CompanionRecord[] {
  const pageCounts = new Map<string, number>();
  for (const companion of companions) {
    if (companion.sourceUrl) {
      pageCounts.set(companion.sourceUrl, (pageCounts.get(companion.sourceUrl) ?? 0) + 1);
    }
  }
  return companions.map((companion) => (
    companion.sourceUrl && pageCounts.get(companion.sourceUrl) === 1
      ? companion
      : { ...companion, sourceUrl: "" }
  ));
}

export async function upsertCompanions(
  tx: SyncTransaction,
  orgId: string,
  companions: CompanionRecord[],
  liveSource: boolean,
  signal?: AbortSignal,
) {
  const existingResidents = await tx.resident.findMany({
    where: { orgId },
    select: { name: true, slug: true, sourceUrl: true },
  });
  const existingSlugs = new Set(existingResidents.map((resident) => resident.slug));
  const residentsByName = new Map(existingResidents.map((resident) => [resident.name, resident]));
  const residentsBySource = new Map(existingResidents
    .filter((resident) => resident.sourceUrl)
    .map((resident) => [resident.sourceUrl, resident]));
  const companionsWithSlugs = companions.map((companion) => {
    const sourceUrl = normalizeSourceUrl(companion.sourceUrl ?? "");
    const existing = (sourceUrl ? residentsBySource.get(sourceUrl) : undefined)
      ?? residentsByName.get(companion.name);
    if (existing) {
      residentsByName.set(companion.name, existing);
      if (sourceUrl) residentsBySource.set(sourceUrl, existing);
      return { companion, slug: existing.slug };
    }

    const resident = {
      name: companion.name,
      slug: allocateResidentSlug(companion.name, existingSlugs),
      sourceUrl,
    };
    residentsByName.set(companion.name, resident);
    if (sourceUrl) residentsBySource.set(sourceUrl, resident);
    return { companion, slug: resident.slug };
  });

  for (let offset = 0; offset < companionsWithSlugs.length; offset += RESIDENT_WRITE_BATCH_SIZE) {
    signal?.throwIfAborted();
    await Promise.all(
      companionsWithSlugs.slice(offset, offset + RESIDENT_WRITE_BATCH_SIZE)
        .map(({ companion, slug }) => upsertCompanion(tx, orgId, companion, slug, liveSource)),
    );
  }
}

export function residentSlug(name: string) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "resident";
}

export function allocateResidentSlug(name: string, usedSlugs: Set<string>) {
  const base = residentSlug(name);
  let slug = base;
  let suffix = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  usedSlugs.add(slug);
  return slug;
}

async function upsertCompanion(
  tx: SyncTransaction,
  orgId: string,
  companion: CompanionRecord,
  slug: string,
  liveSource: boolean,
) {
  const sourceUrl = normalizeSourceUrl(companion.sourceUrl ?? "");
  const profile = {
    species: normalizeSpecies(companion.species),
    breed: companion.breed,
    dobText: companion.dobText,
    ageText: companion.ageText,
    sex: companion.sex,
    weightText: companion.weightText,
    personality: companion.personality,
    careNotes: companion.careNotes,
    photoUrls: companion.photoUrls,
    sourceUrl,
  };

  // Source URL identifies a companion across a rename, so it outranks the name
  // fallback exactly as the slug allocation above does.
  const existing = (sourceUrl ? await tx.resident.findFirst({
    where: { orgId, sourceUrl },
    select: { id: true, unavailabilityReason: true },
  }) : null) ?? await tx.resident.findFirst({
    where: { orgId, name: companion.name },
    select: { id: true, unavailabilityReason: true },
  });

  if (existing) {
    const restoreAvailability = liveSource
      && !companion.adopted
      && existing.unavailabilityReason !== "adopted";
    await tx.resident.update({
      where: { id_orgId: { id: existing.id, orgId } },
      data: {
        name: companion.name,
        ...profile,
        ...(restoreAvailability ? { available: true, unavailabilityReason: null } : {}),
      },
    });
    return;
  }

  // Two companions can share a name on one roster, and a batch writes them
  // concurrently: upsert so the second one updates the first's row instead of
  // failing the unique constraint and aborting the whole sync transaction.
  await tx.resident.upsert({
    where: { orgId_name: { orgId, name: companion.name } },
    create: {
      orgId,
      name: companion.name,
      slug,
      ...profile,
      available: !companion.adopted,
      unavailabilityReason: companion.adopted ? "adopted" : null,
    },
    update: { ...profile },
  });
}

export type RosterSource = {
  text: string;
  /** True when a scrape failure forced the checked-in demo capture. */
  usedFallbackCapture: boolean;
  /** Whether every page expected by roster discovery was gathered. */
  rosterComplete: boolean;
  /** Crawl progress retained so administrators can identify a partial sync. */
  rosterCompleteness: RosterCompleteness;
  /** The configured source or bundled capture that supplied the roster. */
  source: string;
  /** Parsed pages paired with their public page URL when discovery knows it. */
  documents?: RosterDocument[];
};

type RosterDocument = { text: string; sourceUrl: string };

export async function loadRoster(
  sourceUrl: string,
  options: Omit<RosterDiscoveryOptions, "model" | "firecrawl"> = {},
): Promise<RosterSource> {
  options.signal?.throwIfAborted();
  const localPath = resolveLocalSource(sourceUrl);
  if (localPath) {
    const text = await readFile(localPath, { encoding: "utf8", signal: options.signal });
    return {
      text,
      usedFallbackCapture: false,
      rosterComplete: true,
      rosterCompleteness: completeRoster("local"),
      source: sourceUrl,
      documents: [{ text, sourceUrl }],
    };
  }

  try {
    const discovery = await discoverRosterWithCompleteness(sourceUrl, options);
    return {
      ...discovery,
      usedFallbackCapture: false,
      rosterComplete: discovery.rosterCompleteness.complete,
      source: sourceUrl,
    };
  } catch (error) {
    options.signal?.throwIfAborted();
    console.warn("Roster scrape failed; using the checked-in capture.", error);
  }

  const capture = fallbackCapture(sourceUrl);
  const captureText = await readFile(seedCapturePath(capture), { encoding: "utf8", signal: options.signal });
  return {
    text: captureText,
    usedFallbackCapture: true,
    rosterComplete: false,
    rosterCompleteness: {
      complete: false,
      timedOut: false,
      status: "fallback-capture",
      completed: 0,
      total: 0,
    },
    source: `seed/${capture}`,
    documents: [{ text: captureText, sourceUrl }],
  };
}

export async function loadRosterSource(sourceUrl: string): Promise<string> {
  return (await loadRoster(sourceUrl)).text;
}

type RosterToolName = "firecrawl_map" | "firecrawl_scrape" | "firecrawl_batch_scrape" | "firecrawl_crawl";
const FETCHING_TOOLS = new Set<RosterToolName>(["firecrawl_scrape", "firecrawl_batch_scrape", "firecrawl_crawl"]);
const BULK_TOOLS = new Set<RosterToolName>(["firecrawl_batch_scrape", "firecrawl_crawl"]);
type FirecrawlCaller = (name: RosterToolName, input: Record<string, unknown>) => Promise<unknown>;

export type RosterDiscoveryOptions = {
  model?: LanguageModel;
  firecrawl?: FirecrawlCaller;
  signal?: AbortSignal;
  /** The note the agent left after the previous sync of this source, if any. */
  priorNotes?: string | null;
  /** Persists the note the agent leaves for the next sync of this source. */
  saveNotes?: (notes: string) => Promise<void>;
  /** Receives one line per discovery event; defaults to the server console. */
  log?: (message: string) => void;
};

export type FirecrawlCrawlResult = {
  success: boolean;
  status: string;
  total: number;
  completed: number;
  data: unknown[];
  completeness: {
    complete: boolean;
    timedOut: boolean;
    status: string;
    total: number;
    completed: number;
  };
};

type FirecrawlRequestOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  sourceUrl?: string;
  crawlTimeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
};

export async function discoverRoster(
  sourceUrl: string,
  options: RosterDiscoveryOptions = {},
): Promise<string> {
  return (await discoverRosterWithCompleteness(sourceUrl, options)).text;
}

export async function discoverRosterWithCompleteness(
  sourceUrl: string,
  options: RosterDiscoveryOptions = {},
): Promise<{ text: string; rosterCompleteness: RosterCompleteness; notes: string | null; documents: RosterDocument[] }> {
  const firecrawl = options.firecrawl
    ?? ((name, input) => requestFirecrawl(name, input, { sourceUrl, signal: options.signal }));
  const documents: RosterDocument[] = [];
  const listingDocuments: RosterDocument[] = [];
  const bulkDocuments: RosterDocument[] = [];
  const crawlCompleteness: RosterCompleteness[] = [];
  const log = options.log ?? ((message: string) => console.info(`[roster-sync] ${message}`));
  let toolCalls = 0;
  let savedNotes: string | null = null;
  // A bulk fetch leaves provisional notes as soon as it is issued, so a sync that
  // is cut off mid-fetch still tells the next one which pages to get.
  const saveProvisionalNotes = async (name: RosterToolName, input: Record<string, unknown>, outcome: string) => {
    if (savedNotes !== null) return;
    try {
      await options.saveNotes?.(provisionalNotes(name, input, outcome));
    } catch (error) {
      log(`saving provisional notes failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const executeTool = async (name: RosterToolName, input: Record<string, unknown>) => {
    options.signal?.throwIfAborted();
    const startedAt = Date.now();
    const describe = `${name} ${describeToolInput(input)}`;
    log(`${describe} started`);
    let attemptedName: RosterToolName | undefined;
    try {
      if (toolCalls >= MAX_ROSTER_TOOL_CALLS) {
        throw new Error(`Roster discovery is limited to ${MAX_ROSTER_TOOL_CALLS} Firecrawl calls`);
      }
      toolCalls += 1;
      attemptedName = name;
      for (const url of requestedUrls(input)) assertRelatedUrl(sourceUrl, url);
      if (BULK_TOOLS.has(name)) {
        await saveProvisionalNotes(name, input, "the fetch was issued but that sync did not record its result");
      }
      const result = await firecrawl(name, input);
      options.signal?.throwIfAborted();
      if (FETCHING_TOOLS.has(name)) {
        const requestedUrls = name === "firecrawl_batch_scrape" && Array.isArray(input.urls)
          ? [...new Set(input.urls.filter((url): url is string => typeof url === "string"))]
          : [typeof input.url === "string" ? input.url : sourceUrl];
        const sourceDocuments = extractScrapedDocuments(result, requestedUrls);
        if (BULK_TOOLS.has(name)) bulkDocuments.push(...sourceDocuments);
        else if (isListingFetch(sourceUrl, input)) listingDocuments.push(...sourceDocuments);
        else documents.push(...sourceDocuments);
      }
      if (BULK_TOOLS.has(name)) {
        const completeness = readCrawlCompleteness(result);
        crawlCompleteness.push(completeness);
        log(`${describe} ${completeness.status}: ${completeness.completed}/${completeness.total} pages in ${elapsedSeconds(startedAt)}s`);
        await saveProvisionalNotes(name, input, `the fetch finished with status ${completeness.status}, ${completeness.completed} of ${completeness.total} pages`);
      } else {
        log(`${describe} finished in ${elapsedSeconds(startedAt)}s`);
      }
      if (BULK_TOOLS.has(name)) return summarizeCrawlToolResult(result);
      if (name === "firecrawl_scrape") return summarizeScrapeToolResult(result, sourceUrl);
      return truncateToolResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`${describe} failed after ${elapsedSeconds(startedAt)}s: ${message}`);
      if (attemptedName !== undefined && BULK_TOOLS.has(attemptedName)) {
        crawlCompleteness.push({
          complete: false,
          timedOut: false,
          status: "failed",
          completed: 0,
          total: 0,
        });
      }
      // Return failures to the model so another in-scope page can be tried.
      return `Tool call failed: ${message}`;
    }
  };
  const tools = {
    firecrawl_map: tool({
      description: "Find pages on the rescue website that may contain the adoptable companion roster.",
      inputSchema: z.object({
        url: z.string().describe("The rescue website URL to map."),
        search: z.string().optional().describe("Optional terms such as adoptable companions."),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: (input) => executeTool("firecrawl_map", input),
    }),
    firecrawl_scrape: tool({
      description: "Fetch one page as clean markdown for roster parsing, together with its same-site links and data endpoints found in page scripts. A Show More, Load More, or infinite-scroll listing usually has a JSON or AJAX endpoint: scrape that endpoint with a large per-page value, or page until it reports its last page. Use loadMore only when the listing has such a control and no usable data endpoint. Record the endpoint or loadMore selector in save_sync_notes.",
      inputSchema: z.object({
        url: z.string().describe("The page URL to scrape."),
        loadMore: z.object({
          selector: z.string().min(1).describe("CSS selector for the Show More or Load More control."),
          maxClicks: z.number().int().min(1).optional()
            .describe(`Number of clicks to attempt, capped at ${MAX_FIRECRAWL_LOAD_MORE_CLICKS}.`),
        }).optional(),
      }),
      execute: (input) => executeTool("firecrawl_scrape", input),
    }),
    firecrawl_batch_scrape: tool({
      description: "Fetch a chosen set of pages as markdown for roster parsing: the companion detail pages and further listing pages picked from a scraped listing's links. Only these exact URLs are fetched.",
      inputSchema: z.object({
        urls: z.array(z.string()).min(1).max(MAX_BATCH_SCRAPE_URLS)
          .describe("The exact page URLs to fetch, chosen from the listing's links."),
      }),
      execute: (input) => executeTool("firecrawl_batch_scrape", input),
    }),
    firecrawl_crawl: tool({
      description: "Last resort when a listing's links cannot be read: crawl the listing path, following pagination and companion links found under it. The crawl never leaves the configured listing path.",
      inputSchema: z.object({
        url: z.string().describe("The adoption-listing URL to crawl."),
        limit: z.number().int().min(1).max(MAX_FIRECRAWL_CRAWL_PAGES).optional(),
        maxDiscoveryDepth: z.number().int().min(0).max(MAX_FIRECRAWL_DISCOVERY_DEPTH).optional(),
      }),
      execute: (input) => executeTool("firecrawl_crawl", input),
    }),
    save_sync_notes: tool({
      description: "Save notes for the next sync of this source: the listing URL to scrape, how its companion detail links and pagination links look, how many companions the listing showed, data endpoints and their parameters, and any site quirks. Replace the previous notes entirely.",
      inputSchema: z.object({
        notes: z.string().min(1).max(MAX_SYNC_NOTE_CHARS),
      }),
      execute: async ({ notes }) => {
        options.signal?.throwIfAborted();
        try {
          await options.saveNotes?.(notes);
          savedNotes = notes;
          log(`save_sync_notes stored ${notes.length} chars`);
          return "Notes saved for the next sync.";
        } catch (error) {
          return `Saving notes failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
  };

  options.signal?.throwIfAborted();
  const discoveryStartedAt = Date.now();
  log(`discovery started for ${sourceUrl}${options.priorNotes?.trim() ? " with notes from the previous sync" : ""}`);
  const { steps } = await generateText({
    model: options.model ?? createAiModel(),
    maxOutputTokens: MAX_ROSTER_OUTPUT_TOKENS,
    instructions: "Find the rescue's complete current adoptable companion roster. Use map only when the supplied page may not be the adoption listing. Scrape the listing page, read its links, and pick out exactly the links that lead to individual companion pages and to further pages of the same listing; then batch-scrape those chosen URLs. A Show More, Load More, or infinite-scroll control usually has a JSON or AJAX endpoint in dataEndpoints: prefer scraping it with a large per-page value, or paging until the response reports its last page, instead of clicking. When an endpoint's jsonSummary reports a results total, fetch exactly that many distinct companion detail URLs before finishing. Use loadMore only when the scrape reply listed no usable data endpoint and the listing shows a Show More, Load More, or similar button. Compare the expanded reply's link count with the previous scrape and stop once it stops growing. Record the loadMore selector in save_sync_notes. Never fetch pages that are not part of the roster, such as other sections of the site, and only fall back to crawl when the listing exposes no usable links. When notes from the previous sync are given, follow them on your first steps rather than exploring, and explore only if they fail or gather fewer companions than the notes expect. Check that you gathered at least as many companions as the listing shows. Call save_sync_notes as soon as you have fetched the companion pages, and again before finishing if you learned more, with concise guidance for the next sync: the listing URL, what its companion and pagination links look like, the number of companions listed, data endpoints and their parameters, loadMore selectors, and any site quirks. Then reply with a short completion message. Do not invent roster content.",
    prompt: priorNotesPrompt(sourceUrl, options.priorNotes),
    tools,
    stopWhen: isStepCount(MAX_ROSTER_AGENT_STEPS),
    prepareStep: () => toolCalls >= MAX_ROSTER_TOOL_CALLS ? { activeTools: [] } : undefined,
    abortSignal: options.signal,
    onStepFinish: (step) => {
      const requested = step.toolCalls.map((call) => call.toolName).join(", ") || "no tools";
      const reply = step.text.trim() ? `; reply: ${step.text.trim().slice(0, 300)}` : "";
      log(`model step finished (${step.finishReason}): requested ${requested}${reply}`);
    },
  });
  options.signal?.throwIfAborted();
  // Listing and data-endpoint replies describe the roster rather than a
  // companion, so they are parsed only when nothing else was fetched.
  const companionDocuments = [...bulkDocuments, ...documents];
  const rosterDocuments = companionDocuments.length > 0 ? companionDocuments : listingDocuments;
  log(`discovery finished after ${steps.length} model steps, ${toolCalls} tool calls, ${rosterDocuments.length} roster documents in ${elapsedSeconds(discoveryStartedAt)}s`);

  if (rosterDocuments.length === 0) {
    throw new Error("Roster discovery completed without scraping roster content");
  }
  return {
    text: rosterDocuments.map((document) => document.text).join(DOCUMENT_SEPARATOR),
    documents: rosterDocuments,
    rosterCompleteness: combineCrawlCompleteness(crawlCompleteness),
    notes: savedNotes,
  };
}

function priorNotesPrompt(sourceUrl: string, priorNotes: string | null | undefined): string {
  const task = `Find the current companion roster starting from ${sourceUrl}`;
  const notes = priorNotes?.trim();
  if (!notes) return task;
  return `${task}\n\nNotes saved after the previous sync of this source. Begin with the crawl they describe, and verify the result against the live site rather than trusting the notes blindly:\n${notes.slice(0, MAX_SYNC_NOTE_CHARS)}`;
}

function provisionalNotes(name: RosterToolName, input: Record<string, unknown>, outcome: string): string {
  const urls = requestedUrls(input);
  const settings = name === "firecrawl_batch_scrape"
    ? `batch-scrape ${urls.length} pages such as ${urls.slice(0, 3).join(", ")}`
    : [
      `crawl ${urls[0] ?? "the listing"}`,
      input.limit === undefined ? null : `limit ${String(input.limit)}`,
      input.maxDiscoveryDepth === undefined ? null : `maxDiscoveryDepth ${String(input.maxDiscoveryDepth)}`,
    ].filter(Boolean).join(", ");
  return `Provisional notes recorded automatically by the previous sync, which did not write its own: ${settings}; ${outcome}.`;
}

function requestedUrls(input: Record<string, unknown>): string[] {
  const urls = [input.url, ...(Array.isArray(input.urls) ? input.urls : [])];
  return urls.filter((url) => url !== undefined).map((url) => {
    if (typeof url !== "string") throw new Error("Roster tool URL must be a string");
    return url;
  });
}

function describeToolInput(input: Record<string, unknown>): string {
  const { url, urls, loadMore, ...rest } = input;
  const extras = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  const loadMoreDescription = loadMore === undefined ? "" : describeLoadMore(loadMore);
  const urlList = Array.isArray(urls) ? `${urls.length} urls (${urls.slice(0, 3).map(String).join(", ")}${urls.length > 3 ? ", ..." : ""})` : "";
  return [typeof url === "string" ? url : "", urlList, loadMoreDescription, ...extras].filter(Boolean).join(" ");
}

// Logging runs before the request validates its input, so an unusable loadMore
// must still describe itself rather than abort the tool call.
function describeLoadMore(loadMore: unknown): string {
  try {
    return `loadMore selector=${JSON.stringify(loadMoreSelector(loadMore))} clicks=${loadMoreClickCount(loadMore)}`;
  } catch {
    return `loadMore=${JSON.stringify(loadMore)}`;
  }
}

function elapsedSeconds(startedAt: number): string {
  return ((Date.now() - startedAt) / 1000).toFixed(1);
}

function completeRoster(status: string): RosterCompleteness {
  return { complete: true, timedOut: false, status, completed: 0, total: 0 };
}

function readCrawlCompleteness(value: unknown): RosterCompleteness {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const detail = record.completeness && typeof record.completeness === "object"
    && !Array.isArray(record.completeness)
    ? record.completeness as Record<string, unknown>
    : {};
  const completed = finiteNonNegativeInteger(detail.completed ?? record.completed, 0);
  const total = finiteNonNegativeInteger(detail.total ?? record.total, completed);
  return {
    complete: detail.complete === true,
    timedOut: detail.timedOut === true,
    status: typeof detail.status === "string"
      ? detail.status
      : typeof record.status === "string" ? record.status : "unknown",
    completed,
    total,
  };
}

function combineCrawlCompleteness(crawls: RosterCompleteness[]): RosterCompleteness {
  if (crawls.length === 0) {
    return {
      complete: false,
      timedOut: false,
      status: "crawl-not-run",
      completed: 0,
      total: 0,
    };
  }
  return {
    complete: crawls.every((crawl) => crawl.complete),
    timedOut: crawls.some((crawl) => crawl.timedOut),
    status: crawls.every((crawl) => crawl.complete)
      ? "completed"
      : crawls.find((crawl) => !crawl.complete)?.status ?? "incomplete",
    completed: crawls.reduce((sum, crawl) => sum + crawl.completed, 0),
    total: crawls.reduce((sum, crawl) => sum + crawl.total, 0),
  };
}

export function requestFirecrawl(
  name: "firecrawl_crawl" | "firecrawl_batch_scrape",
  input: Record<string, unknown>,
  options: FirecrawlRequestOptions & { sourceUrl: string },
): Promise<FirecrawlCrawlResult>;
export function requestFirecrawl(
  name: "firecrawl_map" | "firecrawl_scrape",
  input: Record<string, unknown>,
  options?: FirecrawlRequestOptions,
): Promise<unknown>;
export function requestFirecrawl(
  name: RosterToolName,
  input: Record<string, unknown>,
  options?: FirecrawlRequestOptions,
): Promise<unknown>;
export async function requestFirecrawl(
  name: RosterToolName,
  input: Record<string, unknown>,
  options: FirecrawlRequestOptions = {},
): Promise<unknown> {
  const apiKey = options.apiKey?.trim() ?? env.FIRECRAWL_API_KEY;
  const enabled = options.apiKey === undefined ? env.features.firecrawl : Boolean(apiKey);
  if (!enabled || !apiKey) {
    throw new Error("FIRECRAWL_API_KEY is required to fetch a live roster");
  }
  const baseUrl = (options.baseUrl ?? env.FIRECRAWL_BASE_URL)
    .replace(/\/+$/u, "");
  const fetcher = options.fetch ?? fetch;

  const jobOptions = { ...options, apiKey, baseUrl, fetch: fetcher };
  if (name === "firecrawl_crawl") return requestFirecrawlCrawl(input, jobOptions);
  if (name === "firecrawl_batch_scrape") return requestFirecrawlBatchScrape(input, jobOptions);

  const endpoint = name === "firecrawl_map" ? "map" : "scrape";
  const body = name === "firecrawl_map"
    ? { ...input, limit: input.limit ?? 25 }
    : firecrawlScrapeBody(input);
  const response = await fetcher(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const payload = (await response.json()) as { success?: boolean; error?: string };
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error ?? `Firecrawl ${endpoint} request failed (${response.status})`);
  }
  return payload;
}

function firecrawlScrapeBody(input: Record<string, unknown>): Record<string, unknown> {
  const { loadMore, ...scrapeInput } = input;
  const actions = loadMore === undefined ? [] : Array.from(
    { length: loadMoreClickCount(loadMore) },
    () => [
      { type: "click", selector: loadMoreSelector(loadMore) },
      { type: "wait", milliseconds: FIRECRAWL_LOAD_MORE_WAIT_MS },
    ],
  ).flat();
  return {
    ...scrapeInput,
    formats: ["markdown", "links", "rawHtml"],
    onlyMainContent: true,
    ...(actions.length > 0 ? { actions } : {}),
  };
}

function loadMoreSelector(value: unknown): string {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).selector !== "string") {
    throw new Error("Roster scrape loadMore selector must be a string");
  }
  const selector = (value as Record<string, unknown>).selector as string;
  if (!selector.trim()) throw new Error("Roster scrape loadMore selector must not be empty");
  return selector;
}

function loadMoreClickCount(value: unknown): number {
  if (!value || typeof value !== "object") throw new Error("Roster scrape loadMore must be an object");
  const maxClicks = (value as Record<string, unknown>).maxClicks;
  if (maxClicks === undefined) return 1;
  if (typeof maxClicks !== "number" || !Number.isFinite(maxClicks) || maxClicks < 1) {
    throw new Error("Roster scrape loadMore maxClicks must be a positive number");
  }
  return Math.min(MAX_FIRECRAWL_LOAD_MORE_CLICKS, Math.floor(maxClicks));
}

async function requestFirecrawlCrawl(
  input: Record<string, unknown>,
  options: Required<Pick<FirecrawlRequestOptions, "apiKey" | "baseUrl" | "fetch">>
    & FirecrawlRequestOptions,
): Promise<FirecrawlCrawlResult> {
  const sourceUrl = options.sourceUrl;
  if (!sourceUrl) throw new Error("A source URL is required to scope a Firecrawl crawl");

  const requestedUrl = requiredHttpUrl(input.url, "Roster crawl URL");
  assertRelatedUrl(sourceUrl, requestedUrl.toString());
  const source = requiredHttpUrl(sourceUrl, "Roster source URL");
  const includePath = pathScopePattern(source.pathname);
  const requestedStartsInScope = pathMatchesScope(requestedUrl.pathname, source.pathname);
  const body = {
    ...input,
    url: requestedStartsInScope ? requestedUrl.toString() : source.toString(),
    includePaths: [includePath],
    regexOnFullURL: false,
    limit: clampedInteger(input.limit, 1, MAX_FIRECRAWL_CRAWL_PAGES),
    maxDiscoveryDepth: clampedInteger(
      input.maxDiscoveryDepth,
      0,
      MAX_FIRECRAWL_DISCOVERY_DEPTH,
    ),
    sitemap: "skip",
    // Firecrawl only follows links below the start URL's path, so the rest of
    // the site is never fetched; pages elsewhere are reached by batch scrape.
    crawlEntireDomain: false,
    allowExternalLinks: false,
    allowSubdomains: false,
  };
  return submitFirecrawlJob("crawl", body, options);
}

async function requestFirecrawlBatchScrape(
  input: Record<string, unknown>,
  options: Required<Pick<FirecrawlRequestOptions, "apiKey" | "baseUrl" | "fetch">>
    & FirecrawlRequestOptions,
): Promise<FirecrawlCrawlResult> {
  const sourceUrl = options.sourceUrl;
  if (!sourceUrl) throw new Error("A source URL is required to scope a Firecrawl batch scrape");
  if (!Array.isArray(input.urls) || input.urls.length === 0) {
    throw new Error("Roster batch scrape needs a list of page URLs");
  }
  if (input.urls.length > MAX_BATCH_SCRAPE_URLS) {
    throw new Error(`Roster batch scrape accepts at most ${MAX_BATCH_SCRAPE_URLS} URLs`);
  }
  const urls = [...new Set(input.urls.map((url) => {
    const parsed = requiredHttpUrl(url, "Roster batch scrape URL");
    assertRelatedUrl(sourceUrl, parsed.toString());
    return parsed.toString();
  }))];
  return submitFirecrawlJob("batch/scrape", {
    urls,
    formats: ["markdown"],
    onlyMainContent: true,
  }, options);
}

// Crawls and batch scrapes share Firecrawl's async job shape: submit, then poll
// the job's status until it completes or the roster's time budget runs out.
async function submitFirecrawlJob(
  endpoint: "crawl" | "batch/scrape",
  body: Record<string, unknown>,
  options: Required<Pick<FirecrawlRequestOptions, "apiKey" | "baseUrl" | "fetch">>
    & FirecrawlRequestOptions,
): Promise<FirecrawlCrawlResult> {
  const submitResponse = await options.fetch(`${options.baseUrl}/${endpoint}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const submit = (await submitResponse.json()) as {
    success?: boolean;
    id?: string;
    error?: string;
  };
  if (!submitResponse.ok || submit.success === false || !submit.id) {
    throw new Error(
      submit.error ?? `Firecrawl ${endpoint} submission failed (${submitResponse.status})`,
    );
  }

  const timeoutMs = Math.max(0, options.crawlTimeoutMs ?? FIRECRAWL_CRAWL_TIMEOUT_MS);
  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? FIRECRAWL_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  let latest: FirecrawlCrawlStatus = {
    success: true,
    status: "scraping",
    total: 0,
    completed: 0,
    data: [],
  };

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const timeoutSignal = AbortSignal.timeout(remainingMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    let response: Response;
    try {
      response = await options.fetch(
        `${options.baseUrl}/${endpoint}/${encodeURIComponent(submit.id)}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${options.apiKey}` },
          signal,
        },
      );
    } catch (error) {
      options.signal?.throwIfAborted();
      if (timeoutSignal.aborted) return crawlResult(latest, true);
      throw error;
    }
    const payload = (await response.json()) as FirecrawlCrawlStatus;
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error ?? `Firecrawl ${endpoint} status failed (${response.status})`);
    }
    latest = normalizeCrawlStatus(payload);
    if (latest.status === "completed" || latest.status === "failed") {
      return crawlResult(latest, false);
    }

    const delayMs = deadline - Date.now();
    if (delayMs <= 0) break;
    await setTimeout(Math.min(pollIntervalMs, delayMs), undefined, {
      signal: options.signal,
    });
  }

  return crawlResult(latest, true);
}

type FirecrawlCrawlStatus = {
  success?: boolean;
  status?: string;
  total?: number;
  completed?: number;
  data?: unknown[];
  error?: string;
};

function normalizeCrawlStatus(payload: FirecrawlCrawlStatus): FirecrawlCrawlStatus & {
  success: boolean;
  status: string;
  total: number;
  completed: number;
  data: unknown[];
} {
  const data = Array.isArray(payload.data) ? payload.data : [];
  const completed = finiteNonNegativeInteger(payload.completed, data.length);
  const total = finiteNonNegativeInteger(payload.total, completed);
  return {
    ...payload,
    success: payload.success !== false,
    status: typeof payload.status === "string" ? payload.status : "scraping",
    total,
    completed,
    data,
  };
}

function crawlResult(payload: FirecrawlCrawlStatus, timedOut: boolean): FirecrawlCrawlResult {
  const normalized = normalizeCrawlStatus(payload);
  const complete = !timedOut
    && normalized.status === "completed"
    && normalized.completed >= normalized.total;
  return {
    success: normalized.success,
    status: normalized.status,
    total: normalized.total,
    completed: normalized.completed,
    data: normalized.data,
    completeness: {
      complete,
      timedOut,
      status: normalized.status,
      total: normalized.total,
      completed: normalized.completed,
    },
  };
}

function requiredHttpUrl(value: unknown, label: string): URL {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} refused unsupported protocol: ${url.protocol}`);
  }
  return url;
}

function pathScopePattern(pathname: string): string {
  const normalized = pathname.replace(/^\/+|\/+$/gu, "");
  if (!normalized) return ".*";
  return `${normalized.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:/.*)?`;
}

function pathMatchesScope(candidatePath: string, sourcePath: string): boolean {
  const normalized = sourcePath === "/" ? "/" : sourcePath.replace(/\/+$/u, "");
  return normalized === "/"
    || candidatePath === normalized
    || candidatePath.startsWith(`${normalized}/`);
}

function clampedInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return maximum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function finiteNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

export function assertRelatedUrl(sourceUrl: string, candidate: unknown) {
  if (typeof candidate !== "string") throw new Error("Roster tool URL must be a string");
  const source = new URL(sourceUrl);
  const requested = new URL(candidate);
  if (requested.protocol !== "http:" && requested.protocol !== "https:") {
    throw new Error(`Roster tool refused unsupported protocol: ${requested.protocol}`);
  }
  if (!isPublicHttpUrl(source.toString()) || !isPublicHttpUrl(requested.toString())) {
    throw new Error(`Roster tool refused private or non-public host: ${requested.hostname}`);
  }
  if (!isRelatedHost(source.hostname, requested.hostname)) {
    throw new Error(`Roster tool refused unrelated host: ${requested.hostname}`);
  }
}

// Rescue sites routinely map to a `www.` or `adopt.` host of the configured
// source, so keep those in scope while still refusing unrelated domains.
// Private suffixes count: two tenants of a shared host (`a.github.io` and
// `b.github.io`, two S3 buckets) are unrelated parties, so treat the tenant
// label as part of the registrable domain rather than sharing `github.io`.
function isRelatedHost(sourceHost: string, requestedHost: string): boolean {
  const sourceDomain = getDomain(sourceHost, { allowPrivateDomains: true });
  const requestedDomain = getDomain(requestedHost, { allowPrivateDomains: true });
  return sourceDomain !== null && sourceDomain === requestedDomain;
}

function truncateToolResult(value: unknown, maxChars = 30_000): string {
  const serialized = JSON.stringify(value);
  return serialized.length <= maxChars ? serialized : `${serialized.slice(0, maxChars)}\n[truncated]`;
}

// The model reads the page text and its same-site links; the full markdown is
// retained separately for roster parsing.
function summarizeScrapeToolResult(value: unknown, sourceUrl: string): string {
  const markdown = extractScrapedText(value) ?? "";
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const data = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : record;
  const links = sameSiteUrls(Array.isArray(data.links) ? data.links : [], sourceUrl);
  const json = scrapedJson(data);
  const jsonLinks = json === null ? [] : sameSiteUrls(stringValues(json), sourceUrl);
  const dataEndpoints = dataEndpointsFromHtml(typeof data.rawHtml === "string" ? data.rawHtml : "", sourceUrl);
  const allLinks = [...new Set([...links, ...jsonLinks])];
  return truncateToolResult({
    markdown: markdown.length <= MAX_SCRAPE_MARKDOWN_CHARS
      ? markdown
      : `${markdown.slice(0, MAX_SCRAPE_MARKDOWN_CHARS)}\n[truncated]`,
    contentType: json === null ? "markdown" : "json",
    ...(json === null ? {} : { jsonSummary: summarizeScrapedJson(json) }),
    links: allLinks.slice(0, MAX_SCRAPE_LINKS),
    linksOmitted: Math.max(0, allLinks.length - MAX_SCRAPE_LINKS),
    dataEndpoints: dataEndpoints.slice(0, MAX_SCRAPE_DATA_ENDPOINTS),
    dataEndpointsOmitted: Math.max(0, dataEndpoints.length - MAX_SCRAPE_DATA_ENDPOINTS),
  }, MAX_SCRAPE_MARKDOWN_CHARS + 30_000);
}

function summarizeScrapedJson(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { items: value.length };
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const pagination = record.pagination;
  return {
    ...(pagination && typeof pagination === "object" && !Array.isArray(pagination)
      ? { pagination }
      : {}),
    ...(Array.isArray(record.items) ? { items: record.items.length } : {}),
  };
}

function sameSiteUrls(values: unknown[], sourceUrl: string): string[] {
  const source = new URL(sourceUrl);
  return [...new Set(values.flatMap((value) => {
    if (typeof value !== "string" || !isUrlShaped(value)) return [];
    try {
      const parsed = new URL(value, source);
      const related = (parsed.protocol === "http:" || parsed.protocol === "https:")
        && isRelatedHost(source.hostname, parsed.hostname);
      parsed.hash = "";
      return related ? [parsed.toString()] : [];
    } catch {
      return [];
    }
  }))];
}

// A bare title or description resolves against the source as a relative URL,
// so only strings written as a URL count; otherwise every string field of an
// endpoint's JSON would land in `links` and be scraped.
function isUrlShaped(value: string): boolean {
  return /^https?:\/\//iu.test(value) || value.startsWith("/") || value.startsWith("./") || value.startsWith("../");
}

function scrapedJson(data: Record<string, unknown>): unknown | null {
  if (data.json && typeof data.json === "object") return data.json;
  for (const value of [data.json, data.rawHtml, data.html, data.markdown, data.content]) {
    if (typeof value !== "string") continue;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringValues);
}

function dataEndpointsFromHtml(html: string, sourceUrl: string): string[] {
  const scriptContents = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/giu)].map((match) => match[1] ?? "");
  const quotedValues = scriptContents.flatMap((script) => [...script.matchAll(/(["'])(.*?)\1/gu)].map((match) => match[2]?.replaceAll("\\/", "/") ?? ""));
  return sameSiteUrls(quotedValues, sourceUrl).filter((value) => isDataEndpoint(new URL(value)));
}

// A scrape of the listing page itself, or of the data endpoint behind it, lists
// companions instead of describing one, so it is not companion content.
function isListingFetch(sourceUrl: string, input: Record<string, unknown>): boolean {
  const url = typeof input.url === "string" ? input.url : null;
  if (url === null) return true;
  const withoutTrailingSlash = (value: string) => value.replace(/\/+$/u, "");
  if (withoutTrailingSlash(url) === withoutTrailingSlash(sourceUrl)) return true;
  try {
    return isDataEndpoint(new URL(url));
  } catch {
    return true;
  }
}

function isDataEndpoint(url: URL): boolean {
  return /\/(?:wp-json|admin-ajax(?:\.php)?|api|graphql)(?:\/|$)/iu.test(url.pathname)
    || url.searchParams.has("rest_route");
}

function summarizeCrawlToolResult(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return truncateToolResult(value, MAX_CRAWL_SUMMARY_CHARS);
  }

  const { data, ...summary } = value as Record<string, unknown>;
  return truncateToolResult({
    ...summary,
    documents: Array.isArray(data) ? data.length : 0,
    documentContent: "retained for roster parsing",
  }, MAX_CRAWL_SUMMARY_CHARS);
}

export function extractScrapedText(value: unknown): string | null {
  return extractScrapedTexts(value)[0] ?? null;
}

export function extractScrapedTexts(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(extractScrapedTexts);
  if ("dryRun" in value && value.dryRun === true) return [];

  const record = value as Record<string, unknown>;
  for (const key of ["markdown", "html", "rawHtml", "content", "text", "value", "output", "data"]) {
    const candidate = record[key];
    const nested = extractScrapedTexts(candidate);
    if (nested.length > 0) return nested;
  }
  return [];
}

function extractScrapedDocuments(value: unknown, fallbackUrls: string[]): RosterDocument[] {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const values = record && Array.isArray(record.data) ? record.data : [value];

  return values.flatMap((item, index) => {
    const sourceUrl = scrapedSourceUrl(item)
      ?? fallbackUrls[index]
      ?? fallbackUrls[0]
      ?? "";
    return extractScrapedTexts(item).map((text) => ({ text, sourceUrl }));
  });
}

function scrapedSourceUrl(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === "object"
    && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown>
    : null;
  for (const candidate of [metadata?.sourceURL, metadata?.sourceUrl, record.sourceURL, record.sourceUrl]) {
    if (typeof candidate === "string" && /^https?:\/\//iu.test(candidate)) return candidate;
  }
  return null;
}

function resolveLocalSource(sourceUrl: string): string | null {
  if (/^https?:\/\//i.test(sourceUrl)) return null;
  const sourcePath = sourceUrl.startsWith("file://") ? new URL(sourceUrl).pathname : sourceUrl;
  return seedCapturePath(path.basename(sourcePath));
}

function fallbackCapture(sourceUrl: string): string {
  return /dogs-page-B\.html/i.test(sourceUrl) ? "dogs-page-B.html" : DEFAULT_CAPTURE;
}

function seedCapturePath(capture: string): string {
  return path.join(process.cwd(), "seed", capture);
}

export function adoptionDraft(
  residentId: string,
  sponsorshipId: string,
  companionName: string,
  sponsorName: string,
  reason: "adopted" | "unavailable",
  heroPhotoUrl: string | null,
) {
  const departure = reason === "adopted"
    ? `${companionName} has been adopted!`
    : `${companionName} is no longer at the rescue.`;
  const subject = reason === "adopted"
    ? `${companionName} found a home!`
    : `${companionName} is no longer at the rescue`;
  const teaser = reason === "adopted"
    ? `${companionName} has found a home. Here is a warm look back at the moments that brought them here.`
    : `${companionName} has left the rescue. Here is a warm look back at the time we shared.`;
  return {
    residentId,
    sponsorshipId,
    type: "graduation" as const,
    status: "draft" as const,
    subject,
    teaser,
    bodyText: `${sponsorName}, ${departure} Once this notice is approved, your sponsorship will pause and no further charges will be made while you choose what comes next. Thank you for everything you gave ${companionName} along the way.`,
    heroPhotoUrl,
  };
}
