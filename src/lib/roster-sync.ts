import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createToolCallingChatCompletion,
  type ChatCompletionAssistantMessage,
  type ChatCompletionMessage,
  type ChatCompletionTool,
} from "./chat-completions.ts";
import type { DogRecord } from "./parser.ts";
import { parseDogRoster } from "./parser.ts";
import { prisma } from "./prisma.ts";

export type SyncSummary = {
  created: number;
  updated: number;
  adopted: number;
  restored: number;
  sponsorshipsClosed: number;
  usedFallbackCapture: boolean;
  source: string;
};

const DEFAULT_CAPTURE = "dogs-page-A.html";
const DEFAULT_FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v2";
const MAX_FIRECRAWL_CRAWL_PAGES = 100;
const MAX_FIRECRAWL_DISCOVERY_DEPTH = 3;
const FIRECRAWL_CRAWL_TIMEOUT_MS = 30_000;
const FIRECRAWL_POLL_INTERVAL_MS = 1_000;
const MAX_ROSTER_AGENT_STEPS = 8;
const MAX_ROSTER_TOOL_CALLS = 12;
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
  const { text, usedFallbackCapture, source } = await loadRoster(
    settings.sourceUrl,
    options,
  );
  options.signal?.throwIfAborted();
  const dogs = await parseDogRoster(text);
  options.signal?.throwIfAborted();

  if (dogs.length === 0) {
    throw new Error("Roster sync refused to adopt every resident after parsing an empty roster");
  }

  return prisma.$transaction(async (tx) => {
    options.signal?.throwIfAborted();
    const before = await tx.resident.findMany({
      where: { orgId },
      select: { id: true, name: true, status: true },
    });
    const existingNames = new Set(before.map((resident) => resident.name));
    const rosterNames = new Set(dogs.map((dog) => dog.name));
    const explicitlyAdopted = new Set(
      dogs.filter((dog) => dog.adopted).map((dog) => dog.name),
    );

    // A dog vanishing from the roster only means "adopted" when we actually
    // read the configured source. After a scrape failure we are looking at a
    // checked-in capture that knows nothing about the live roster, so absence
    // proves nothing there and only explicit *Adopted markers count.
    const adoptionCandidates = before.filter(
      (resident) => resident.status === "available"
        && (explicitlyAdopted.has(resident.name)
          || (!usedFallbackCapture && !rosterNames.has(resident.name))),
    );

    assertPlausibleAdoptionCount(
      before.filter((resident) => resident.status === "available").length,
      adoptionCandidates.length,
      usedFallbackCapture,
    );

    // The mirror image of the adoption rule, with the same evidence standard:
    // a dog we read on the live configured source without an Adopted marker is
    // demonstrably not adopted, so a wrongly-adopted resident heals on the
    // next good sync. A fallback capture proves nothing and never restores.
    const restoreCandidates = usedFallbackCapture ? [] : before.filter(
      (resident) => resident.status === "adopted"
        && rosterNames.has(resident.name)
        && !explicitlyAdopted.has(resident.name),
    );

    for (const dog of dogs) {
      options.signal?.throwIfAborted();
      await upsertDog(tx, orgId, dog, !usedFallbackCapture);
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
        select: { id: true, sponsorName: true },
      });

      for (const sponsorship of sponsorships) {
        options.signal?.throwIfAborted();
        await tx.sponsorship.update({
          where: { id_orgId: { id: sponsorship.id, orgId } },
          data: { status: "ended", endedReason: "adopted" },
        });
        await tx.pupdate.create({
          data: { ...graduationDraft(resident.id, resident.name, sponsorship.sponsorName), orgId },
        });
      }

      sponsorshipsClosed += sponsorships.length;
    }

    return {
      created: dogs.filter((dog) => !existingNames.has(dog.name)).length,
      updated: dogs.filter((dog) => existingNames.has(dog.name)).length,
      adopted: adoptionCandidates.length,
      restored: restoreCandidates.length,
      sponsorshipsClosed,
      usedFallbackCapture,
      source,
    };
  }, { maxWait: 10_000, timeout: 60_000 });
}

export function assertPlausibleAdoptionCount(
  availableResidents: number,
  adoptionCandidates: number,
  usedFallbackCapture: boolean,
) {
  // A bundled capture only adopts dogs carrying an explicit adoption marker,
  // so preserve that intentionally conservative fallback behavior.
  if (usedFallbackCapture || availableResidents === 0) return;

  if (adoptionCandidates / availableResidents > MAX_LIVE_ADOPTION_FRACTION) {
    throw new RosterSyncRefusal(
      `The parsed roster would adopt ${adoptionCandidates} of ${availableResidents} available residents. Please verify the roster source and try again.`,
    );
  }
}

type SyncTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function upsertDog(
  tx: SyncTransaction,
  orgId: string,
  dog: DogRecord,
  liveSource: boolean,
) {
  const profile = {
    breed: dog.breed,
    dobText: dog.dobText,
    ageText: dog.ageText,
    sex: dog.sex,
    weightText: dog.weightText,
    personality: dog.personality,
    careNotes: dog.careNotes,
    photoUrls: dog.photoUrls,
  };

  await tx.resident.upsert({
    where: { orgId_name: { orgId, name: dog.name } },
    create: {
      orgId,
      name: dog.name,
      ...profile,
      status: dog.adopted ? "adopted" : "available",
      adoptedAt: dog.adopted ? new Date() : null,
    },
    update: {
      ...profile,
      // Presence on the live source without an Adopted marker restores an
      // adopted resident to available. Explicit markers stay with the adoption
      // pass above, which owns the sponsorship-ending side effects.
      ...(liveSource && !dog.adopted
        ? { status: "available" as const, adoptedAt: null }
        : {}),
    },
  });
}

export type RosterSource = {
  text: string;
  /** True when a scrape failure forced the checked-in demo capture. */
  usedFallbackCapture: boolean;
  /** The configured source or bundled capture that supplied the roster. */
  source: string;
};

export async function loadRoster(
  sourceUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<RosterSource> {
  options.signal?.throwIfAborted();
  const localPath = resolveLocalSource(sourceUrl);
  if (localPath) {
    return {
      text: await readFile(localPath, { encoding: "utf8", signal: options.signal }),
      usedFallbackCapture: false,
      source: sourceUrl,
    };
  }

  try {
    const text = await discoverRoster(sourceUrl, options);
    return { text, usedFallbackCapture: false, source: sourceUrl };
  } catch (error) {
    options.signal?.throwIfAborted();
    console.warn("Roster scrape failed; using the checked-in capture.", error);
  }

  const capture = fallbackCapture(sourceUrl);
  return {
    text: await readFile(seedCapturePath(capture), { encoding: "utf8", signal: options.signal }),
    usedFallbackCapture: true,
    source: `seed/${capture}`,
  };
}

export async function loadRosterSource(sourceUrl: string): Promise<string> {
  return (await loadRoster(sourceUrl)).text;
}

type RosterToolName = "firecrawl_map" | "firecrawl_scrape" | "firecrawl_crawl";
type RosterModel = (
  messages: ChatCompletionMessage[],
  tools: ChatCompletionTool[],
  signal?: AbortSignal,
) => Promise<ChatCompletionAssistantMessage>;
type FirecrawlCaller = (name: RosterToolName, input: Record<string, unknown>) => Promise<unknown>;

export type RosterDiscoveryOptions = {
  model?: RosterModel;
  firecrawl?: FirecrawlCaller;
  signal?: AbortSignal;
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

const ROSTER_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "firecrawl_map",
      description: "Find pages on the rescue website that may contain the adoptable-dog roster.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The rescue website URL to map." },
          search: { type: "string", description: "Optional terms such as adoptable dogs." },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "firecrawl_scrape",
      description: "Fetch one page as clean markdown for roster parsing.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The page URL to scrape." } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "firecrawl_crawl",
      description: "Crawl the complete adoption listing, following pagination and dog-detail links within the configured listing path.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The adoption-listing URL to crawl." },
          limit: { type: "integer", minimum: 1, maximum: MAX_FIRECRAWL_CRAWL_PAGES },
          maxDiscoveryDepth: {
            type: "integer",
            minimum: 0,
            maximum: MAX_FIRECRAWL_DISCOVERY_DEPTH,
          },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
];

export async function discoverRoster(
  sourceUrl: string,
  options: RosterDiscoveryOptions = {},
): Promise<string> {
  const model = options.model ?? defaultRosterModel;
  const firecrawl = options.firecrawl
    ?? ((name, input) => requestFirecrawl(name, input, { sourceUrl, signal: options.signal }));
  const messages: ChatCompletionMessage[] = [
    {
      role: "system",
      content: "Find the rescue's complete current adoptable-dog roster. Use map when the supplied page may not be the adoption listing. Crawl the listing so you cover every pagination page and every dog-detail page linked from it; use scrape only for a specific page that the crawl did not capture. Stay within the adoption listing and its linked dog details rather than exploring the rest of the site. When the gathered content is complete, reply with a short completion message. Do not invent roster content.",
    },
    {
      role: "user",
      content: `Find the current dog roster starting from ${sourceUrl}`,
    },
  ];
  const documents: string[] = [];
  let toolCalls = 0;

  for (let step = 0; step < MAX_ROSTER_AGENT_STEPS; step += 1) {
    options.signal?.throwIfAborted();
    const response = await model(messages, ROSTER_TOOLS, options.signal);
    options.signal?.throwIfAborted();
    messages.push(response);
    const calls = response.tool_calls ?? [];
    if (calls.length === 0) break;

    for (const call of calls) {
      options.signal?.throwIfAborted();
      let content: string;
      try {
        if (toolCalls >= MAX_ROSTER_TOOL_CALLS) {
          throw new Error(`Roster discovery is limited to ${MAX_ROSTER_TOOL_CALLS} Firecrawl calls`);
        }
        toolCalls += 1;
        const name = rosterToolName(call.function.name);
        const input = parseToolInput(call.function.arguments);
        assertRelatedUrl(sourceUrl, input.url);
        const result = await firecrawl(name, input);
        options.signal?.throwIfAborted();
        if (name === "firecrawl_scrape" || name === "firecrawl_crawl") {
          documents.push(...extractScrapedTexts(result));
        }
        content = name === "firecrawl_crawl"
          ? summarizeCrawlToolResult(result)
          : truncateToolResult(result);
      } catch (error) {
        // Report a refused or failed call back to the model so the remaining
        // steps can pick another page instead of discarding what was scraped.
        content = `Tool call failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }

  if (documents.length === 0) {
    throw new Error("Roster discovery completed without scraping roster content");
  }
  return documents.join("\n\n");
}

async function defaultRosterModel(
  messages: ChatCompletionMessage[],
  tools: ChatCompletionTool[],
  signal?: AbortSignal,
): Promise<ChatCompletionAssistantMessage> {
  return createToolCallingChatCompletion({ messages, tools, maxTokens: 1_000, signal });
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
  const apiKey = (options.apiKey ?? process.env.FIRECRAWL_API_KEY)?.trim();
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required to fetch a live roster");
  const baseUrl = (options.baseUrl ?? process.env.FIRECRAWL_BASE_URL ?? DEFAULT_FIRECRAWL_BASE_URL)
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
    crawlEntireDomain: false,
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
    let response: Response;
    try {
      response = await fetchBeforeDeadline(
        options.fetch,
        `${options.baseUrl}/crawl/${encodeURIComponent(submit.id)}`,
        {
          method: "GET",
          headers: { authorization: `Bearer ${options.apiKey}` },
        },
        deadline,
        options.signal,
      );
    } catch (error) {
      if (error instanceof FirecrawlPollTimeout) return crawlResult(latest, true);
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

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await delayWithSignal(Math.min(pollIntervalMs, remainingMs), options.signal);
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

class FirecrawlPollTimeout extends Error {}

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

async function fetchBeforeDeadline(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  deadline: number,
  signal?: AbortSignal,
): Promise<Response> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new FirecrawlPollTimeout();
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(), remainingMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } catch (error) {
    signal?.throwIfAborted();
    if (controller.signal.aborted) throw new FirecrawlPollTimeout();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function delayWithSignal(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

function rosterToolName(value: string): RosterToolName {
  if (
    value === "firecrawl_map"
    || value === "firecrawl_scrape"
    || value === "firecrawl_crawl"
  ) return value;
  throw new Error(`Unsupported roster tool: ${value}`);
}

function parseToolInput(value: string): Record<string, unknown> {
  const input = JSON.parse(value) as unknown;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Roster tool arguments must be a JSON object");
  }
  return input as Record<string, unknown>;
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
function isRelatedHost(sourceHost: string, requestedHost: string): boolean {
  const base = sourceHost.toLowerCase().replace(/^www\./u, "");
  const requested = requestedHost.toLowerCase();
  return requested === base || requested.endsWith(`.${base}`);
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

export function graduationDraft(residentId: string, dogName: string, sponsorName: string) {
  return {
    residentId,
    type: "graduation" as const,
    status: "draft" as const,
    subject: `${dogName} has been adopted!`,
    bodyText: `Great news, ${sponsorName} — ${dogName} has found a forever home. Your monthly sponsorship has ended automatically. Thank you for helping ${dogName} reach graduation day!`,
    smsText: `${dogName} has been adopted! Your sponsorship has ended. Thank you for helping make this happy ending possible.`,
  };
}
