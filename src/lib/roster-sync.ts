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
const MAX_ROSTER_AGENT_STEPS = 4;
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

export async function syncRoster(orgId: string): Promise<SyncSummary> {
  const settings = await prisma.rescueSettings.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  });
  const { text, usedFallbackCapture, source } = await loadRoster(settings.sourceUrl);
  const dogs = await parseDogRoster(text);

  if (dogs.length === 0) {
    throw new Error("Roster sync refused to adopt every resident after parsing an empty roster");
  }

  return prisma.$transaction(async (tx) => {
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
      await upsertDog(tx, orgId, dog, !usedFallbackCapture);
    }

    let sponsorshipsClosed = 0;

    for (const resident of adoptionCandidates) {
      await tx.resident.update({
        where: { id_orgId: { id: resident.id, orgId } },
        data: { status: "adopted", adoptedAt: new Date() },
      });

      const sponsorships = await tx.sponsorship.findMany({
        where: { residentId: resident.id, orgId, status: "active" },
        select: { id: true, sponsorName: true },
      });

      for (const sponsorship of sponsorships) {
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

export async function loadRoster(sourceUrl: string): Promise<RosterSource> {
  const localPath = resolveLocalSource(sourceUrl);
  if (localPath) {
    return {
      text: await readFile(localPath, "utf8"),
      usedFallbackCapture: false,
      source: sourceUrl,
    };
  }

  try {
    const text = await discoverRoster(sourceUrl);
    return { text, usedFallbackCapture: false, source: sourceUrl };
  } catch (error) {
    console.warn("Roster scrape failed; using the checked-in capture.", error);
  }

  const capture = fallbackCapture(sourceUrl);
  return {
    text: await readFile(seedCapturePath(capture), "utf8"),
    usedFallbackCapture: true,
    source: `seed/${capture}`,
  };
}

export async function loadRosterSource(sourceUrl: string): Promise<string> {
  return (await loadRoster(sourceUrl)).text;
}

type RosterToolName = "firecrawl_map" | "firecrawl_scrape";
type RosterModel = (
  messages: ChatCompletionMessage[],
  tools: ChatCompletionTool[],
) => Promise<ChatCompletionAssistantMessage>;
type FirecrawlCaller = (name: RosterToolName, input: Record<string, unknown>) => Promise<unknown>;

export type RosterDiscoveryOptions = {
  model?: RosterModel;
  firecrawl?: FirecrawlCaller;
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
];

export async function discoverRoster(
  sourceUrl: string,
  options: RosterDiscoveryOptions = {},
): Promise<string> {
  const model = options.model ?? defaultRosterModel;
  const firecrawl = options.firecrawl ?? requestFirecrawl;
  const messages: ChatCompletionMessage[] = [
    {
      role: "system",
      content: "Find the rescue's current adoptable-dog roster. Use map when the supplied page may not be the roster, then scrape the most relevant page or pages. When the scraped content is sufficient, reply with a short completion message. Do not invent roster content.",
    },
    {
      role: "user",
      content: `Find the current dog roster starting from ${sourceUrl}`,
    },
  ];
  const documents: string[] = [];

  for (let step = 0; step < MAX_ROSTER_AGENT_STEPS; step += 1) {
    const response = await model(messages, ROSTER_TOOLS);
    messages.push(response);
    const calls = response.tool_calls ?? [];
    if (calls.length === 0) break;

    for (const call of calls) {
      const name = rosterToolName(call.function.name);
      const input = parseToolInput(call.function.arguments);
      assertRelatedUrl(sourceUrl, input.url);
      const result = await firecrawl(name, input);
      if (name === "firecrawl_scrape") {
        const text = extractScrapedText(result);
        if (text) documents.push(text);
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: truncateToolResult(result),
      });
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
): Promise<ChatCompletionAssistantMessage> {
  return createToolCallingChatCompletion({ messages, tools, maxTokens: 1_000 });
}

export async function requestFirecrawl(
  name: RosterToolName,
  input: Record<string, unknown>,
  options: { apiKey?: string; baseUrl?: string; fetch?: typeof fetch } = {},
): Promise<unknown> {
  const apiKey = (options.apiKey ?? process.env.FIRECRAWL_API_KEY)?.trim();
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required to fetch a live roster");
  const baseUrl = (options.baseUrl ?? process.env.FIRECRAWL_BASE_URL ?? DEFAULT_FIRECRAWL_BASE_URL)
    .replace(/\/+$/u, "");
  const endpoint = name === "firecrawl_map" ? "map" : "scrape";
  const body = name === "firecrawl_map"
    ? { ...input, limit: input.limit ?? 25 }
    : { ...input, formats: ["markdown"], onlyMainContent: true };
  const response = await (options.fetch ?? fetch)(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { success?: boolean; error?: string };
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error ?? `Firecrawl ${endpoint} request failed (${response.status})`);
  }
  return payload;
}

function rosterToolName(value: string): RosterToolName {
  if (value === "firecrawl_map" || value === "firecrawl_scrape") return value;
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
  if (source.hostname !== requested.hostname) {
    throw new Error(`Roster tool refused unrelated host: ${requested.hostname}`);
  }
}

function truncateToolResult(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.length <= 30_000 ? serialized : `${serialized.slice(0, 30_000)}\n[truncated]`;
}

export function extractScrapedText(value: unknown): string | null {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : null;
  if ("dryRun" in value && value.dryRun === true) return null;

  const record = value as Record<string, unknown>;
  for (const key of ["html", "rawHtml", "markdown", "content", "text", "value", "output", "data"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    const nested = extractScrapedText(candidate);
    if (nested) return nested;
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
