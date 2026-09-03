import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MockLanguageModelV3 } from "ai/test";

import {
  assertPlausibleAdoptionCount,
  discoverRoster,
  discoverRosterWithCompleteness,
  extractScrapedText,
  extractScrapedTexts,
  graduationDraft,
  loadRoster,
  loadRosterSource,
  planRosterStatusChanges,
  requestFirecrawl,
  RosterSyncRefusal,
} from "./roster-sync.ts";
import { parseCompanionRoster } from "./parser.ts";

type ScriptMessage = { role: string; content: string | null };
type ScriptTool = { function: { name: string } };
type ScriptResponse = {
  role: "assistant";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

function promptContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  return content.map((part) => {
    if (!part || typeof part !== "object") return "";
    const value = part as Record<string, unknown>;
    if (value.type === "text") return String(value.text ?? "");
    if (value.type === "tool-result") {
      const output = value.output as Record<string, unknown> | undefined;
      return output?.type === "text" ? String(output.value ?? "") : JSON.stringify(output ?? "");
    }
    return "";
  }).join("");
}

function scriptedModel(
  next: (messages: ScriptMessage[], tools: ScriptTool[]) => Promise<ScriptResponse>,
) {
  return new MockLanguageModelV3({
    doGenerate: async (request) => {
      const messages = request.prompt.map((message) => ({
        role: message.role,
        content: promptContent(message.content),
      }));
      const tools = (request.tools ?? [])
        .filter((entry) => entry.type === "function")
        .map((entry) => ({ function: { name: entry.name } }));
      const response = await next(messages, tools);
      return {
        content: [
          ...(response.content ? [{ type: "text" as const, text: response.content }] : []),
          ...(response.tool_calls ?? []).map((call) => ({
            type: "tool-call" as const,
            toolCallId: call.id,
            toolName: call.function.name,
            input: call.function.arguments,
          })),
        ],
        finishReason: {
          unified: response.tool_calls?.length ? "tool-calls" as const : "stop" as const,
          raw: undefined,
        },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

function rosterCompanion(name: string, adopted: boolean) {
  return {
    name,
    breed: "",
    dobText: "",
    ageText: "",
    sex: "",
    weightText: "",
    personality: "",
    careNotes: [],
    photoUrls: [],
    adopted,
  };
}

test("loads a checked-in roster path without requiring the network", async () => {
  const expected = await readFile(new URL("../../seed/dogs-page-A.html", import.meta.url), "utf8");

  assert.equal(await loadRosterSource("seed/dogs-page-A.html"), expected);
});

test("extracts nested scrape content but rejects dry-run calls", () => {
  const cleanedHtml = "<h3>Hattie</h3>";
  const rawHtml = "<!doctype html><h3>Walnut</h3>";

  assert.equal(extractScrapedText({ output: { data: { html: cleanedHtml } } }), cleanedHtml);
  assert.equal(extractScrapedText({ data: { rawHtml } }), rawHtml);
  assert.equal(extractScrapedText({ output: { value: "# roster" } }), "# roster");
  assert.equal(extractScrapedText({ dryRun: true, input: { url: "https://example.test" } }), null);
});

test("extracts every document from a multi-document crawl result", () => {
  assert.deepEqual(extractScrapedTexts({
    data: [
      { markdown: "# Hattie" },
      { content: "# Walnut" },
      { output: { html: "<h3>June</h3>" } },
    ],
  }), ["# Hattie", "# Walnut", "<h3>June</h3>"]);
});

test("a bounded model loop maps the rescue site and scrapes the selected roster", async () => {
  const modelSteps: string[][] = [];
  const firecrawlCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  let step = 0;
  const text = await discoverRoster("https://rescue.example/landing", {
    model: scriptedModel(async (messages, tools) => {
      modelSteps.push(messages.map((message) => message.role));
      assert.deepEqual(tools.map((tool) => tool.function.name), [
        "firecrawl_map",
        "firecrawl_scrape",
        "firecrawl_crawl",
      ]);
      step += 1;
      if (step === 1) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "map-1",
            type: "function",
            function: {
              name: "firecrawl_map",
              arguments: JSON.stringify({ url: "https://rescue.example", search: "adoptable companions" }),
            },
          }],
        };
      }
      if (step === 2) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "scrape-1",
            type: "function",
            function: {
              name: "firecrawl_scrape",
              arguments: JSON.stringify({ url: "https://rescue.example/adopt/companions" }),
            },
          }],
        };
      }
      return { role: "assistant", content: "The roster is ready." };
    }),
    firecrawl: async (name, input) => {
      firecrawlCalls.push({ name, input });
      return name === "firecrawl_map"
        ? { success: true, links: [{ url: "https://rescue.example/adopt/companions" }] }
        : { success: true, data: { markdown: "# Hattie\nBreed: Mixed" } };
    },
  });

  assert.equal(text, "# Hattie\nBreed: Mixed");
  assert.deepEqual(firecrawlCalls.map((call) => call.name), [
    "firecrawl_map",
    "firecrawl_scrape",
  ]);
  assert.deepEqual(modelSteps.map((messages) => messages.at(-1)), ["user", "tool", "tool"]);
});

test("a scrape without a completed crawl is not treated as a complete roster", async () => {
  let step = 0;
  const discovery = await discoverRosterWithCompleteness("https://rescue.example/companions", {
    model: scriptedModel(async () => {
      step += 1;
      if (step > 1) return { role: "assistant", content: "Done." };
      return {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "scrape-1",
          type: "function",
          function: {
            name: "firecrawl_scrape",
            arguments: JSON.stringify({ url: "https://rescue.example/companions" }),
          },
        }],
      };
    }),
    firecrawl: async () => ({ success: true, data: { markdown: "# Hattie" } }),
  });

  assert.equal(discovery.rosterCompleteness.complete, false);
  assert.equal(discovery.rosterCompleteness.status, "crawl-not-run");
});

test("a crawl contributes every document to roster parsing while returning a bounded summary", async () => {
  const toolReplies: string[] = [];
  let step = 0;
  const documents = [
    "# Hattie\nBreed: Mixed\n![Hattie](https://rescue.example/hattie.jpg)",
    "# Walnut\nAge: 4 years\n![Walnut](https://rescue.example/walnut.jpg)",
    `# June\nPersonality: Sweet\n![June](https://rescue.example/june.jpg)\n${"details ".repeat(8_000)}`,
  ];

  const text = await discoverRoster("https://rescue.example/adopt/companions", {
    model: scriptedModel(async (messages, tools) => {
      const systemContent = messages.find((message) => message.role === "system")?.content;
      const systemPrompt = typeof systemContent === "string" ? systemContent : "";
      assert.match(systemPrompt, /every pagination page/);
      assert.match(systemPrompt, /every companion detail page/);
      assert.match(systemPrompt, /rather than exploring the rest of the site/);
      assert.deepEqual(tools.map((tool) => tool.function.name), [
        "firecrawl_map",
        "firecrawl_scrape",
        "firecrawl_crawl",
      ]);
      const last = messages.at(-1);
      if (last?.role === "tool" && typeof last.content === "string") toolReplies.push(last.content);
      step += 1;
      if (step > 1) return { role: "assistant", content: "Done." };
      return {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "crawl-1",
          type: "function",
          function: {
            name: "firecrawl_crawl",
            arguments: JSON.stringify({ url: "https://rescue.example/adopt/companions" }),
          },
        }],
      };
    }),
    firecrawl: async () => ({
      success: true,
      status: "completed",
      completeness: { complete: true },
      data: documents.map((markdown) => ({ markdown })),
    }),
  });

  const companions = await parseCompanionRoster(text, { deterministic: true });
  assert.deepEqual(companions.map((companion) => companion.name), ["Hattie", "Walnut", "June"]);
  assert.equal(toolReplies.length, 1);
  assert.ok((toolReplies[0]?.length ?? Infinity) <= 4_100);
  assert.match(toolReplies[0] ?? "", /"documents":3/);
  assert.doesNotMatch(toolReplies[0] ?? "", /details details/);
});

test("roster discovery retains an incomplete crawl's progress", async () => {
  let step = 0;
  const discovery = await discoverRosterWithCompleteness(
    "https://rescue.example/adopt/companions",
    {
      model: scriptedModel(async () => {
        step += 1;
        if (step > 1) return { role: "assistant", content: "Done." };
        return {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "partial-crawl",
            type: "function",
            function: {
              name: "firecrawl_crawl",
              arguments: JSON.stringify({ url: "https://rescue.example/adopt/companions" }),
            },
          }],
        };
      }),
      firecrawl: async () => ({
        success: true,
        status: "scraping",
        completed: 2,
        total: 5,
        completeness: {
          complete: false,
          timedOut: true,
          status: "scraping",
          completed: 2,
          total: 5,
        },
        data: [{ markdown: "# Hattie" }, { markdown: "# Walnut" }],
      }),
    },
  );

  assert.match(discovery.text, /Hattie/);
  assert.deepEqual(discovery.rosterCompleteness, {
    complete: false,
    timedOut: true,
    status: "scraping",
    completed: 2,
    total: 5,
  });
});

test("bounds total Firecrawl calls even when the model requests a large batch", async () => {
  let firecrawlCalls = 0;
  let modelCalls = 0;

  await assert.rejects(
    discoverRoster("https://rescue.example/adopt/companions", {
      model: scriptedModel(async () => {
        modelCalls += 1;
        if (modelCalls > 1) return { role: "assistant", content: "Done." };
        return {
          role: "assistant",
          content: null,
          tool_calls: Array.from({ length: 20 }, (_, index) => ({
            id: `map-${index}`,
            type: "function" as const,
            function: {
              name: "firecrawl_map",
              arguments: JSON.stringify({ url: "https://rescue.example/adopt/companions" }),
            },
          })),
        };
      }),
      firecrawl: async () => {
        firecrawlCalls += 1;
        return { success: true, links: [] };
      },
    }),
    /without scraping roster content/,
  );

  assert.equal(firecrawlCalls, 12);
});

test("calls the direct Firecrawl v2 endpoints with bearer authentication", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, data: { markdown: "# Roster" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await requestFirecrawl(
    "firecrawl_scrape",
    { url: "https://rescue.example/companions" },
    { apiKey: "fc-test", baseUrl: "https://firecrawl.example/v2/", fetch: fetcher },
  );

  assert.equal(requests[0]?.url, "https://firecrawl.example/v2/scrape");
  assert.equal((requests[0]?.init?.headers as Record<string, string>).authorization, "Bearer fc-test");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    url: "https://rescue.example/companions",
    formats: ["markdown"],
    onlyMainContent: true,
  });
});

test("submits a Firecrawl v2 crawl job and polls it to completion", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    { success: true, id: "crawl-job-1", url: "https://api.example/crawl/crawl-job-1" },
    { status: "scraping", total: 3, completed: 1, data: [{ markdown: "# Hattie" }] },
    {
      status: "completed",
      total: 3,
      completed: 3,
      data: [
        { markdown: "# Hattie" },
        { markdown: "# Walnut" },
        { markdown: "# June" },
      ],
    },
  ];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await requestFirecrawl(
    "firecrawl_crawl",
    { url: "https://rescue.example/adopt/companions" },
    {
      apiKey: "fc-test",
      baseUrl: "https://firecrawl.example/v2",
      sourceUrl: "https://rescue.example/adopt/companions",
      fetch: fetcher,
      pollIntervalMs: 0,
    },
  );

  assert.deepEqual(requests.map((request) => [request.init?.method, request.url]), [
    ["POST", "https://firecrawl.example/v2/crawl"],
    ["GET", "https://firecrawl.example/v2/crawl/crawl-job-1"],
    ["GET", "https://firecrawl.example/v2/crawl/crawl-job-1"],
  ]);
  assert.equal(result.data.length, 3);
  assert.deepEqual(result.completeness, {
    complete: true,
    timedOut: false,
    status: "completed",
    total: 3,
    completed: 3,
  });
});

test("narrows a broad crawl request to the configured listing path", async () => {
  let submittedBody: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") {
      submittedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({ success: true, id: "crawl-job-2" });
    }
    return Response.json({ status: "completed", total: 1, completed: 1, data: [{}] });
  };

  await requestFirecrawl(
    "firecrawl_crawl",
    {
      url: "https://rescue.example/",
      includePaths: [".*"],
      crawlEntireDomain: true,
      allowExternalLinks: true,
      sitemap: "include",
    },
    {
      apiKey: "fc-test",
      sourceUrl: "https://rescue.example/adopt/companions/",
      fetch: fetcher,
      pollIntervalMs: 0,
    },
  );

  assert.equal(submittedBody?.url, "https://rescue.example/adopt/companions/");
  assert.deepEqual(submittedBody?.includePaths, ["adopt/companions(?:/.*)?"]);
  assert.equal(submittedBody?.regexOnFullURL, false);
  assert.equal(submittedBody?.crawlEntireDomain, false);
  assert.equal(submittedBody?.allowExternalLinks, false);
  assert.equal(submittedBody?.allowSubdomains, false);
  assert.equal(submittedBody?.sitemap, "skip");
});

test("refuses a crawl request for an unrelated host before fetching", async () => {
  let fetchCalls = 0;
  const fetcher: typeof fetch = async () => {
    fetchCalls += 1;
    return Response.json({ success: true, id: "should-not-run" });
  };

  await assert.rejects(
    requestFirecrawl(
      "firecrawl_crawl",
      { url: "https://elsewhere.test/companions" },
      {
        apiKey: "fc-test",
        sourceUrl: "https://rescue.example/adopt/companions",
        fetch: fetcher,
      },
    ),
    /refused unrelated host: elsewhere\.test/,
  );
  assert.equal(fetchCalls, 0);
});

test("clamps Firecrawl crawl page and discovery limits", async () => {
  let submittedBody: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") {
      submittedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({ success: true, id: "crawl-job-3" });
    }
    return Response.json({ status: "completed", total: 0, completed: 0, data: [] });
  };

  await requestFirecrawl(
    "firecrawl_crawl",
    {
      url: "https://rescue.example/adopt/companions",
      limit: 100_000,
      maxDiscoveryDepth: 99,
    },
    {
      apiKey: "fc-test",
      sourceUrl: "https://rescue.example/adopt/companions",
      fetch: fetcher,
      pollIntervalMs: 0,
    },
  );

  assert.equal(submittedBody?.limit, 100);
  assert.equal(submittedBody?.maxDiscoveryDepth, 3);
});

test("reports a Firecrawl crawl polling timeout as incomplete", async () => {
  let fetchCalls = 0;
  const fetcher: typeof fetch = async () => {
    fetchCalls += 1;
    return Response.json({ success: true, id: "crawl-job-4" });
  };

  const result = await requestFirecrawl(
    "firecrawl_crawl",
    { url: "https://rescue.example/adopt/companions" },
    {
      apiKey: "fc-test",
      sourceUrl: "https://rescue.example/adopt/companions",
      fetch: fetcher,
      crawlTimeoutMs: 0,
    },
  );

  assert.equal(fetchCalls, 1);
  assert.deepEqual(result.completeness, {
    complete: false,
    timedOut: true,
    status: "scraping",
    total: 0,
    completed: 0,
  });
});

test("a crawl without Firecrawl credentials never contacts the network", async () => {
  let fetchCalls = 0;
  const fetcher: typeof fetch = async () => {
    fetchCalls += 1;
    return Response.json({ success: true, id: "should-not-run" });
  };

  await assert.rejects(
    requestFirecrawl(
      "firecrawl_crawl",
      { url: "https://rescue.example/adopt/companions" },
      {
        apiKey: "",
        sourceUrl: "https://rescue.example/adopt/companions",
        fetch: fetcher,
      },
    ),
    /FIRECRAWL_API_KEY is required/,
  );
  assert.equal(fetchCalls, 0);
});

test("reports a refused tool call back to the model and keeps scraped content", async () => {
  const toolReplies: string[] = [];
  let step = 0;
  const call = (id: string, name: string, args: Record<string, unknown>) => ({
    id,
    type: "function" as const,
    function: { name, arguments: JSON.stringify(args) },
  });

  const text = await discoverRoster("https://rescue.example/companions", {
    model: scriptedModel(async (messages) => {
      const last = messages.at(-1);
      if (last?.role === "tool" && typeof last.content === "string") toolReplies.push(last.content);
      step += 1;
      if (step === 1) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [call("scrape-off", "firecrawl_scrape", { url: "https://elsewhere.test/companions" })],
        };
      }
      if (step === 2) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [call("scrape-www", "firecrawl_scrape", { url: "https://www.rescue.example/companions" })],
        };
      }
      return { role: "assistant", content: "Done." };
    }),
    firecrawl: async () => ({ success: true, data: { markdown: "# Hattie" } }),
  });

  assert.equal(text, "# Hattie");
  assert.match(toolReplies[0] ?? "", /refused unrelated host: elsewhere\.test/);
});

test("scrapes subdomains of the configured source but refuses other protocols", async () => {
  const toolReplies: string[] = [];
  let step = 0;

  const text = await discoverRoster("https://www.rescue.example/", {
    model: scriptedModel(async (messages) => {
      const last = messages.at(-1);
      if (last?.role === "tool" && typeof last.content === "string") toolReplies.push(last.content);
      step += 1;
      if (step > 2) return { role: "assistant", content: "Done." };
      const url = step === 1 ? "file:///etc/passwd" : "https://adopt.rescue.example/companions";
      return {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: `scrape-${step}`,
          type: "function",
          function: { name: "firecrawl_scrape", arguments: JSON.stringify({ url }) },
        }],
      };
    }),
    firecrawl: async () => ({ success: true, data: { markdown: "# Walnut" } }),
  });

  assert.equal(text, "# Walnut");
  assert.match(toolReplies[0] ?? "", /unsupported protocol: file:/);
});

test("stops roster discovery after eight model steps", async () => {
  let modelCalls = 0;

  await assert.rejects(
    discoverRoster("https://rescue.example/companions", {
      model: scriptedModel(async () => {
        modelCalls += 1;
        return {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: `map-${modelCalls}`,
            type: "function",
            function: {
              name: "firecrawl_map",
              arguments: JSON.stringify({ url: "https://rescue.example/companions" }),
            },
          }],
        };
      }),
      firecrawl: async () => ({ success: true, links: [] }),
    }),
    /without scraping roster content/,
  );

  assert.equal(modelCalls, 8);
});

test("graduation drafts are queued and sponsor-specific", () => {
  const draft = graduationDraft("companion-1", "Hattie", "Sam");

  assert.equal(draft.type, "graduation");
  assert.equal(draft.status, "draft");
  assert.match(draft.bodyText, /Sam/);
  assert.match(draft.bodyText, /sponsorship has ended/i);
});

test("refuses a live sync that would adopt most available residents", () => {
  assert.throws(
    () => assertPlausibleAdoptionCount(10, 6, false),
    (error) => error instanceof RosterSyncRefusal
      && /adopt 6 of 10 available residents/.test(error.reason),
  );
});

test("allows a plausible live adoption count", () => {
  assert.doesNotThrow(() => assertPlausibleAdoptionCount(10, 2, false));
});

test("preserves explicit adoption handling for fallback captures", () => {
  assert.doesNotThrow(() => assertPlausibleAdoptionCount(10, 10, true));
});

test("an incomplete crawl does not adopt a resident missing from the partial roster", () => {
  const changes = planRosterStatusChanges(
    [{ id: "resident-1", name: "Hattie", status: "available" }],
    [rosterCompanion("Walnut", false)],
    { usedFallbackCapture: false, rosterComplete: false },
  );

  assert.deepEqual(changes.adoptionCandidates, []);
});

test("an incomplete crawl still adopts a resident with an explicit Adopted marker", () => {
  const resident = { id: "resident-1", name: "Hattie", status: "available" };
  const changes = planRosterStatusChanges(
    [resident],
    [rosterCompanion("Hattie", true)],
    { usedFallbackCapture: false, rosterComplete: false },
  );

  assert.deepEqual(changes.adoptionCandidates, [resident]);
});

test("a complete crawl still adopts an available resident missing from the roster", () => {
  const resident = { id: "resident-1", name: "Hattie", status: "available" };
  const changes = planRosterStatusChanges(
    [resident],
    [rosterCompanion("Walnut", false)],
    { usedFallbackCapture: false, rosterComplete: true },
  );

  assert.deepEqual(changes.adoptionCandidates, [resident]);
});

test("an incomplete crawl does not restore an adopted resident", () => {
  const changes = planRosterStatusChanges(
    [{ id: "resident-1", name: "Hattie", status: "adopted" }],
    [rosterCompanion("Hattie", false)],
    { usedFallbackCapture: false, rosterComplete: false },
  );

  assert.deepEqual(changes.restoreCandidates, []);
});

test("a configured local capture is the real source, not a scrape fallback", async () => {
  const roster = await loadRoster("seed/dogs-page-A.html");

  assert.equal(roster.usedFallbackCapture, false);
  assert.equal(roster.rosterComplete, true);
  assert.equal(roster.source, "seed/dogs-page-A.html");
  assert.match(roster.text, /Hattie/);
});

test("an unreachable remote source is flagged as a fallback capture", async () => {
  const roster = await loadRoster("https://example.test/companions-and-more");

  assert.equal(roster.usedFallbackCapture, true);
  assert.equal(roster.rosterComplete, false);
  assert.equal(roster.source, "seed/dogs-page-A.html");
  assert.match(roster.text, /Walnut/);
});
