import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { generateText, isStepCount, tool, type LanguageModel } from "ai";
import { getDomain } from "tldts";
import { z } from "zod";

import { createAiModel } from "./ai-model.ts";
import { env } from "./env.ts";
import type { CompanionRecord } from "./parser.ts";
import { DOCUMENT_SEPARATOR, parseCompanionRoster } from "./parser.ts";
import { prisma } from "./prisma.ts";
import { revalidatePublicRoster } from "./public-roster-cache.ts";

export type SyncSummary = {
  created: number;
  updated: number;
  adopted: number;
  restored: number;
  sponsorshipsClosed: number;
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
export const MAX_SYNC_NOTE_CHARS = 4_000;
const MAX_CRAWL_SUMMARY_CHARS = 4_000;
// A live scrape should never make most of the current roster disappear at once.
// Require a human to investigate instead of treating that disappearance as adoption.
const MAX_LIVE_ADOPTION_FRACTION = 0.5;

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
  const priorNote = await prisma.rosterSyncNote.findFirst({
    where: { orgId, sourceUrl },
    orderBy: { createdAt: "desc" },
    select: { notes: true },
  });
  options.signal?.throwIfAborted();
  const {
    text,
    usedFallbackCapture,
    rosterComplete,
    rosterCompleteness,
    source,
  } = await loadRoster(sourceUrl, {
    signal: options.signal,
    priorNotes: priorNote?.notes ?? null,
    saveNotes: async (notes) => {
      await prisma.rosterSyncNote.create({ data: { orgId, sourceUrl, notes } });
    },
  });
  options.signal?.throwIfAborted();
  const companions = await parseCompanionRoster(text);
  options.signal?.throwIfAborted();

  if (companions.length === 0) {
    throw new Error("Roster sync refused to adopt every resident after parsing an empty roster");
  }

  const summary = await prisma.$transaction(async (tx) => {
    options.signal?.throwIfAborted();
    const before = await tx.resident.findMany({
      where: { orgId },
      select: { id: true, name: true, status: true },
    });
    const existingNames = new Set(before.map((resident) => resident.name));
    const { adoptionCandidates, restoreCandidates } = planRosterStatusChanges(
      before,
      companions,
      { usedFallbackCapture, rosterComplete },
    );

    assertPlausibleAdoptionCount(
      before.filter((resident) => resident.status === "available").length,
      adoptionCandidates.length,
      usedFallbackCapture || !rosterComplete,
    );

    for (const companion of companions) {
      options.signal?.throwIfAborted();
      await upsertCompanion(tx, orgId, companion, !usedFallbackCapture && rosterComplete);
    }

    let sponsorshipsClosed = 0;

    for (const resident of adoptionCandidates) {
      options.signal?.throwIfAborted();
      await tx.resident.update({
        where: { id_orgId: { id: resident.id, orgId } },
        data: { status: "adopted", adoptedAt: new Date() },
      });

      const sponsorships = await tx.sponsorship.findMany({
        where: { residentId: resident.id, orgId, status: "active" },
        select: { id: true, sponsor: { select: { name: true } } },
      });

      for (const sponsorship of sponsorships) {
        options.signal?.throwIfAborted();
        await tx.sponsorship.update({
          where: { id_orgId: { id: sponsorship.id, orgId } },
          data: { status: "ended", endedReason: "adopted" },
        });
        await tx.pupdate.create({
          data: { ...graduationDraft(resident.id, resident.name, sponsorship.sponsor.name), orgId },
        });
      }

      sponsorshipsClosed += sponsorships.length;
    }

    return {
      created: companions.filter((companion) => !existingNames.has(companion.name)).length,
      updated: companions.filter((companion) => existingNames.has(companion.name)).length,
      adopted: adoptionCandidates.length,
      restored: restoreCandidates.length,
      sponsorshipsClosed,
      usedFallbackCapture,
      rosterComplete,
      rosterCompleteness,
      source,
    };
  }, { maxWait: 10_000, timeout: 60_000 });
  revalidatePublicRoster();
  return summary;
}

type ResidentStatusSnapshot = {
  id: string;
  name: string;
  status: string;
};

export function planRosterStatusChanges<T extends ResidentStatusSnapshot>(
  before: T[],
  companions: CompanionRecord[],
  source: Pick<RosterSource, "usedFallbackCapture" | "rosterComplete">,
) {
  const rosterNames = new Set(companions.map((companion) => companion.name));
  const explicitlyAdopted = new Set(
    companions.filter((companion) => companion.adopted).map((companion) => companion.name),
  );
  const absenceIsReliable = !source.usedFallbackCapture && source.rosterComplete;

  // Absence only proves adoption after a complete read of the configured
  // source. Partial crawls and checked-in fallback captures still honor an
  // explicit Adopted marker, but never infer a status from a missing companion.
  const adoptionCandidates = before.filter(
    (resident) => resident.status === "available"
      && (explicitlyAdopted.has(resident.name)
        || (absenceIsReliable && !rosterNames.has(resident.name))),
  );

  // Restoration uses the same evidence standard: only a complete live roster
  // proves that an unmarked resident should be available again.
  const restoreCandidates = absenceIsReliable ? before.filter(
    (resident) => resident.status === "adopted"
      && rosterNames.has(resident.name)
      && !explicitlyAdopted.has(resident.name),
  ) : [];

  return { adoptionCandidates, restoreCandidates };
}

export function assertPlausibleAdoptionCount(
  availableResidents: number,
  adoptionCandidates: number,
  usedFallbackCapture: boolean,
) {
  // A bundled capture only adopts companions carrying an explicit adoption marker,
  // so preserve that intentionally conservative fallback behavior.
  if (usedFallbackCapture || availableResidents === 0) return;

  if (adoptionCandidates / availableResidents > MAX_LIVE_ADOPTION_FRACTION) {
    throw new RosterSyncRefusal(
      `The parsed roster would adopt ${adoptionCandidates} of ${availableResidents} available residents. Please verify the roster source and try again.`,
    );
  }
}

type SyncTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function upsertCompanion(
  tx: SyncTransaction,
  orgId: string,
  companion: CompanionRecord,
  liveSource: boolean,
) {
  const profile = {
    breed: companion.breed,
    dobText: companion.dobText,
    ageText: companion.ageText,
    sex: companion.sex,
    weightText: companion.weightText,
    personality: companion.personality,
    careNotes: companion.careNotes,
    photoUrls: companion.photoUrls,
  };

  await tx.resident.upsert({
    where: { orgId_name: { orgId, name: companion.name } },
    create: {
      orgId,
      name: companion.name,
      ...profile,
      status: companion.adopted ? "adopted" : "available",
      adoptedAt: companion.adopted ? new Date() : null,
    },
    update: {
      ...profile,
      // Presence on the live source without an Adopted marker restores an
      // adopted resident to available. Explicit markers stay with the adoption
      // pass above, which owns the sponsorship-ending side effects.
      ...(liveSource && !companion.adopted
        ? { status: "available" as const, adoptedAt: null }
        : {}),
    },
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
};

export async function loadRoster(
  sourceUrl: string,
  options: Omit<RosterDiscoveryOptions, "model" | "firecrawl"> = {},
): Promise<RosterSource> {
  options.signal?.throwIfAborted();
  const localPath = resolveLocalSource(sourceUrl);
  if (localPath) {
    return {
      text: await readFile(localPath, { encoding: "utf8", signal: options.signal }),
      usedFallbackCapture: false,
      rosterComplete: true,
      rosterCompleteness: completeRoster("local"),
      source: sourceUrl,
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
  return {
    text: await readFile(seedCapturePath(capture), { encoding: "utf8", signal: options.signal }),
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
): Promise<{ text: string; rosterCompleteness: RosterCompleteness; notes: string | null }> {
  const firecrawl = options.firecrawl
    ?? ((name, input) => requestFirecrawl(name, input, { sourceUrl, signal: options.signal }));
  const documents: string[] = [];
  const listingDocuments: string[] = [];
  const bulkDocuments: string[] = [];
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
        const scraped = extractScrapedTexts(result);
        if (BULK_TOOLS.has(name)) bulkDocuments.push(...scraped);
        else if (isListingFetch(sourceUrl, input)) listingDocuments.push(...scraped);
        else documents.push(...scraped);
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
    text: rosterDocuments.join(DOCUMENT_SEPARATOR),
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

function assertRelatedUrl(sourceUrl: string, candidate: unknown) {
  if (typeof candidate !== "string") throw new Error("Roster tool URL must be a string");
  const source = new URL(sourceUrl);
  const requested = new URL(candidate);
  if (requested.protocol !== "http:" && requested.protocol !== "https:") {
    throw new Error(`Roster tool refused unsupported protocol: ${requested.protocol}`);
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

export function graduationDraft(residentId: string, companionName: string, sponsorName: string) {
  return {
    residentId,
    type: "graduation" as const,
    status: "draft" as const,
    subject: `${companionName} has been adopted!`,
    bodyText: `Great news, ${sponsorName} — ${companionName} has found a forever home. Your monthly sponsorship has ended automatically. Thank you for helping ${companionName} reach graduation day!`,
    smsText: `${companionName} has been adopted! Your sponsorship has ended. Thank you for helping make this happy ending possible.`,
  };
}
