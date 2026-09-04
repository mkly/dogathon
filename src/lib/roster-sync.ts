import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { generateText, isStepCount, tool, type LanguageModel } from "ai";
import { getDomain } from "tldts";
import { z } from "zod";

import { createAiModel } from "./ai-model.ts";
import { env } from "./env.ts";
import type { CompanionRecord } from "./parser.ts";
import { parseCompanionRoster } from "./parser.ts";
import { prisma } from "./prisma.ts";

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
const MAX_CRAWL_INCLUDE_PATHS = 5;
const MAX_CRAWL_INCLUDE_PATH_CHARS = 200;
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

  return prisma.$transaction(async (tx) => {
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

type RosterToolName = "firecrawl_map" | "firecrawl_scrape" | "firecrawl_crawl";
type FirecrawlCaller = (name: RosterToolName, input: Record<string, unknown>) => Promise<unknown>;

export type RosterDiscoveryOptions = {
  model?: LanguageModel;
  firecrawl?: FirecrawlCaller;
  signal?: AbortSignal;
  /** The note the agent left after the previous sync of this source, if any. */
  priorNotes?: string | null;
  /** Persists the note the agent leaves for the next sync of this source. */
  saveNotes?: (notes: string) => Promise<void>;
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
  const crawlCompleteness: RosterCompleteness[] = [];
  let toolCalls = 0;
  let savedNotes: string | null = null;
  const executeTool = async (name: RosterToolName, input: Record<string, unknown>) => {
    options.signal?.throwIfAborted();
    let attemptedName: RosterToolName | undefined;
    try {
      if (toolCalls >= MAX_ROSTER_TOOL_CALLS) {
        throw new Error(`Roster discovery is limited to ${MAX_ROSTER_TOOL_CALLS} Firecrawl calls`);
      }
      toolCalls += 1;
      attemptedName = name;
      assertRelatedUrl(sourceUrl, input.url);
      const result = await firecrawl(name, input);
      options.signal?.throwIfAborted();
      if (name === "firecrawl_scrape" || name === "firecrawl_crawl") {
        documents.push(...extractScrapedTexts(result));
      }
      if (name === "firecrawl_crawl") {
        crawlCompleteness.push(readCrawlCompleteness(result));
      }
      return name === "firecrawl_crawl"
        ? summarizeCrawlToolResult(result)
        : truncateToolResult(result);
    } catch (error) {
      if (attemptedName === "firecrawl_crawl") {
        crawlCompleteness.push({
          complete: false,
          timedOut: false,
          status: "failed",
          completed: 0,
          total: 0,
        });
      }
      // Return failures to the model so another in-scope page can be tried.
      return `Tool call failed: ${error instanceof Error ? error.message : String(error)}`;
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
      description: "Fetch one page as clean markdown for roster parsing.",
      inputSchema: z.object({
        url: z.string().describe("The page URL to scrape."),
      }),
      execute: (input) => executeTool("firecrawl_scrape", input),
    }),
    firecrawl_crawl: tool({
      description: "Crawl the complete adoption listing, following pagination and companion detail links. The crawl stays within the configured listing path unless includePaths adds the path pattern of companion detail pages that live elsewhere on the same site.",
      inputSchema: z.object({
        url: z.string().describe("The adoption-listing URL to crawl."),
        includePaths: z.array(z.string().max(MAX_CRAWL_INCLUDE_PATH_CHARS))
          .max(MAX_CRAWL_INCLUDE_PATHS)
          .optional()
          .describe("Extra URL path regexes (without the leading slash, for example \"sfspca-adoption/.*\") for companion detail pages outside the listing path. Patterns must name a specific section; the whole site is never crawled."),
        limit: z.number().int().min(1).max(MAX_FIRECRAWL_CRAWL_PAGES).optional(),
        maxDiscoveryDepth: z.number().int().min(0).max(MAX_FIRECRAWL_DISCOVERY_DEPTH).optional(),
      }),
      execute: (input) => executeTool("firecrawl_crawl", input),
    }),
    save_sync_notes: tool({
      description: "Save notes for the next sync of this source: the listing URL to crawl, which includePaths reach the companion detail pages, how many companions the listing showed, and any site quirks. Replace the previous notes entirely.",
      inputSchema: z.object({
        notes: z.string().min(1).max(MAX_SYNC_NOTE_CHARS),
      }),
      execute: async ({ notes }) => {
        options.signal?.throwIfAborted();
        try {
          await options.saveNotes?.(notes);
          savedNotes = notes;
          return "Notes saved for the next sync.";
        } catch (error) {
          return `Saving notes failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    }),
  };

  options.signal?.throwIfAborted();
  await generateText({
    model: options.model ?? createAiModel(),
    maxOutputTokens: 1_000,
    instructions: "Find the rescue's complete current adoptable companion roster. Use map when the supplied page may not be the adoption listing. Crawl the listing so you cover every pagination page and every companion detail page linked from it; use scrape only for a specific page that the crawl did not capture. Stay within the adoption listing and its linked companion details rather than exploring the rest of the site: when the listing only links to companion detail pages that live under a different path on the same site, pass that path pattern as includePaths instead of widening the crawl. Follow the notes from the previous sync when they are given, and check that the crawl gathered at least as many companions as the listing shows. Before finishing, call save_sync_notes with concise guidance for the next sync: the listing URL to crawl, the includePaths that reach detail pages, the number of companions listed, and any site quirks. Then reply with a short completion message. Do not invent roster content.",
    prompt: priorNotesPrompt(sourceUrl, options.priorNotes),
    tools,
    stopWhen: isStepCount(MAX_ROSTER_AGENT_STEPS),
    prepareStep: () => toolCalls >= MAX_ROSTER_TOOL_CALLS ? { activeTools: [] } : undefined,
    abortSignal: options.signal,
  });
  options.signal?.throwIfAborted();

  if (documents.length === 0) {
    throw new Error("Roster discovery completed without scraping roster content");
  }
  return {
    text: documents.join("\n\n"),
    rosterCompleteness: combineCrawlCompleteness(crawlCompleteness),
    notes: savedNotes,
  };
}

function priorNotesPrompt(sourceUrl: string, priorNotes: string | null | undefined): string {
  const task = `Find the current companion roster starting from ${sourceUrl}`;
  const notes = priorNotes?.trim();
  if (!notes) return task;
  return `${task}\n\nNotes saved after the previous sync of this source (verify them against the live site rather than trusting them blindly):\n${notes.slice(0, MAX_SYNC_NOTE_CHARS)}`;
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
  name: "firecrawl_crawl",
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

  if (name === "firecrawl_crawl") {
    return requestFirecrawlCrawl(input, {
      ...options,
      apiKey,
      baseUrl,
      fetch: fetcher,
    });
  }

  const endpoint = name === "firecrawl_map" ? "map" : "scrape";
  const body = name === "firecrawl_map"
    ? { ...input, limit: input.limit ?? 25 }
    : { ...input, formats: ["markdown"], onlyMainContent: true };
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
  const extraIncludePaths = scopedIncludePaths(input.includePaths);
  const requestedStartsInScope = pathMatchesScope(requestedUrl.pathname, source.pathname);
  const body = {
    ...input,
    url: requestedStartsInScope ? requestedUrl.toString() : source.toString(),
    includePaths: [includePath, ...extraIncludePaths],
    regexOnFullURL: false,
    limit: clampedInteger(input.limit, 1, MAX_FIRECRAWL_CRAWL_PAGES),
    maxDiscoveryDepth: clampedInteger(
      input.maxDiscoveryDepth,
      0,
      MAX_FIRECRAWL_DISCOVERY_DEPTH,
    ),
    sitemap: "skip",
    // Firecrawl only follows links below the start URL's path unless the whole
    // domain is opened up; includePaths then narrows it back to the listing and
    // the detail-page section, so the rest of the site is still never fetched.
    crawlEntireDomain: extraIncludePaths.length > 0,
    allowExternalLinks: false,
    allowSubdomains: false,
  };

  const submitResponse = await options.fetch(`${options.baseUrl}/crawl`, {
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
      submit.error ?? `Firecrawl crawl submission failed (${submitResponse.status})`,
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
        `${options.baseUrl}/crawl/${encodeURIComponent(submit.id)}`,
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
      throw new Error(payload.error ?? `Firecrawl crawl status failed (${response.status})`);
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

// Probe paths that a detail-page pattern must not match: a pattern that
// admits arbitrary top-level pages would crawl the whole site.
const BROAD_PATTERN_PROBES = ["", "about-us", "news/2024/annual-report", "wp-content/uploads/photo.jpg"];

function scopedIncludePaths(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Roster crawl includePaths must be an array of path patterns");
  if (value.length > MAX_CRAWL_INCLUDE_PATHS) {
    throw new Error(`Roster crawl accepts at most ${MAX_CRAWL_INCLUDE_PATHS} includePaths`);
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.length > MAX_CRAWL_INCLUDE_PATH_CHARS) {
      throw new Error("Roster crawl includePaths must be short path patterns");
    }
    const pattern = entry.trim().replace(/^\/+/u, "");
    let matcher: RegExp;
    try {
      matcher = new RegExp(`^(?:${pattern})$`, "u");
    } catch {
      throw new Error(`Roster crawl includePaths pattern is not a valid regex: ${entry}`);
    }
    if (BROAD_PATTERN_PROBES.some((probe) => matcher.test(probe))) {
      throw new Error(`Roster crawl refused an includePaths pattern that would crawl the whole site: ${entry}`);
    }
    return pattern;
  });
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
  for (const key of ["html", "rawHtml", "markdown", "content", "text", "value", "output", "data"]) {
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
