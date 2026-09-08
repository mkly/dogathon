import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import type { UIMessage } from "ai";

import {
  buildInterviewSystemPrompt,
  interviewTurn,
  summarizeInterview,
} from "./volunteer-interview.ts";
import { interviewRequestSchema } from "./volunteer-interview-request.ts";
import { messageText } from "./ui-message-text.ts";
import { env } from "./env.ts";

const companion = { name: "Biscuit", breed: "Corgi mix", sex: "Female", ageText: "Adult" };
const originalEnvironment = {
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  OPENAI_MODEL: env.OPENAI_MODEL,
  features: env.features,
};
const originalFetch = globalThis.fetch;

function message(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

before(() => {
  env.OPENAI_API_KEY = undefined;
  env.features = Object.freeze({ ...env.features, ai: false });
});

afterEach(() => {
  env.OPENAI_API_KEY = undefined;
  env.OPENAI_BASE_URL = "https://api.openai.com/v1";
  env.OPENAI_MODEL = "gpt-4o-mini";
  env.features = Object.freeze({ ...env.features, ai: false });
  globalThis.fetch = originalFetch;
});

after(() => {
  env.OPENAI_API_KEY = originalEnvironment.OPENAI_API_KEY;
  env.OPENAI_BASE_URL = originalEnvironment.OPENAI_BASE_URL;
  env.OPENAI_MODEL = originalEnvironment.OPENAI_MODEL;
  env.features = originalEnvironment.features;
  globalThis.fetch = originalFetch;
});

test("builds a bounded, grounded companion interview prompt", () => {
  const prompt = buildInterviewSystemPrompt({ companion, orgName: "Happy Tails" });

  assert.match(prompt, /Biscuit/u);
  assert.match(prompt, /Corgi mix/u);
  assert.match(prompt, /one short question at a time/u);
  assert.match(prompt, /no more than five questions/u);
  assert.match(prompt, /Never invent facts/u);
  assert.match(prompt, /medical advice/u);
  assert.match(prompt, /one concrete visible detail/u);
  assert.match(prompt, /Never infer health, breed, or identity from a photo/u);
  assert.match(prompt, /\[\[READY\]\]/u);
});

test("uses the deterministic three-question script and then marks the interview ready", async () => {
  const turns = [message("u0", "user", "I'd like to check in")];
  const expectedQuestions = [
    "What did you and Biscuit do together today?",
    "How was Biscuit's mood and energy?",
    "Is there anything else staff should know",
  ];

  for (const [index, expected] of expectedQuestions.entries()) {
    const response = await interviewTurn({ companion, orgName: "Happy Tails", messages: turns });
    const body = await response.text();
    assert.match(body, new RegExp(expected.replace(/[?' ]/gu, "."), "u"));
    turns.push(message(`a${index}`, "assistant", body.includes("bathroom")
      ? "Is there anything else staff should know, such as eating, drinking, bathroom habits, or a nice moment?"
      : expectedQuestions[index]));
    turns.push(message(`u${index + 1}`, "user", `Answer ${index + 1}`));
  }

  const ready = await interviewTurn({ companion, orgName: "Happy Tails", messages: turns });
  assert.match(await ready.text(), /\[\[READY\]\]/u);
});

test("passes the complete text-only turn to the persistence callback", async () => {
  const original = [message("u1", "user", "We walked around the garden")];
  let persisted: UIMessage[] | undefined;
  const response = await interviewTurn(
    { companion, orgName: "Happy Tails", messages: original },
    { onFinish(messages) { persisted = messages; } },
  );
  await response.text();

  assert.equal(persisted?.length, 2);
  assert.deepEqual(persisted?.[0], original[0]);
  assert.equal(persisted?.[1].role, "assistant");
  assert.match(persisted ? messageText(persisted[1]) : "", /do together today/u);
});

test("summarizes fallback answers deterministically", async () => {
  const result = await summarizeInterview({
    companion,
    messages: [
      message("u1", "user", "We walked around the garden"),
      message("a1", "assistant", "How was her mood?"),
      message("u2", "user", "She was calm and drank water"),
    ],
  });

  assert.equal(result.note, "We walked around the garden. She was calm and drank water.");
});

test("streams a credentialed interview turn with the companion prompt", async () => {
  env.OPENAI_API_KEY = "test-key";
  env.OPENAI_BASE_URL = "https://model.example/v1";
  env.OPENAI_MODEL = "rescue-interviewer";
  env.features = Object.freeze({ ...env.features, ai: true });
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const chunks = [
      { choices: [{ index: 0, delta: { role: "assistant", content: "How did Biscuit seem today?" }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ].map((chunk) => `data: ${JSON.stringify(chunk)}`).join("\n\n");
    return new Response(`${chunks}\n\ndata: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
    });
  };

  const response = await interviewTurn({
    companion,
    orgName: "Happy Tails",
    messages: [message("u1", "user", "We went for a walk")],
  });

  assert.match(await response.text(), /How did Biscuit seem today\?/u);
  assert.ok(requestBody);
  const messages = requestBody.messages as Array<{ role: string; content: string }>;
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Happy Tails/u);
  assert.match(messages[0].content, /no more than five questions/u);
  assert.match(messages[0].content, /\[\[READY\]\]/u);
});

test("opens from photo bytes and falls back to a text-only opening when vision fails", async () => {
  env.OPENAI_API_KEY = "test-key";
  env.OPENAI_BASE_URL = "https://model.example/v1";
  env.OPENAI_MODEL = "vision-interviewer";
  env.features = Object.freeze({ ...env.features, ai: true });
  const requestBodies: Array<Record<string, unknown>> = [];
  const logged: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args) => { logged.push(args); };
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (requestBodies.length === 1) {
      return Response.json(
        { error: { message: "This model does not support image input" } },
        { status: 400 },
      );
    }
    return Response.json({
      choices: [{ message: { content: "What did you and Biscuit do together today?" }, finish_reason: "stop" }],
    });
  };

  try {
    const response = await interviewTurn({
      companion,
      orgName: "Happy Tails",
      messages: [],
      photo: { data: new Uint8Array([1, 2, 3]), mime: "image/jpeg" },
    });
    assert.match(await response.text(), /What did you and Biscuit do together today/u);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(requestBodies.length, 2);
  assert.match(JSON.stringify(requestBodies[0]), /data:image\/jpeg;base64/u);
  assert.doesNotMatch(JSON.stringify(requestBodies[1]), /image_url|data:image/u);
  assert.match(String(logged[0]?.[0]), /vision opening failed/u);
});

test("uses structured model output for a grounded summary", async () => {
  env.OPENAI_API_KEY = "test-key";
  env.OPENAI_BASE_URL = "https://model.example/v1";
  env.OPENAI_MODEL = "rescue-interviewer";
  env.features = Object.freeze({ ...env.features, ai: true });
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ note: "Biscuit enjoyed a calm garden walk." }) } }],
    });
  };

  const result = await summarizeInterview({
    companion,
    messages: [message("u1", "user", "We had a calm garden walk")],
  });

  assert.equal(result.note, "Biscuit enjoyed a calm garden walk.");
  assert.ok(requestBody);
  const messages = requestBody.messages as Array<{ role: string; content: string }>;
  assert.match(messages[0].content, /do not invent details/u);
  assert.match(messages[1].content, /calm garden walk/u);
});

test("keeps assistant messages that carry step boundary parts", () => {
  const parsed = interviewRequestSchema.safeParse({
    orgSlug: "happy-tails",
    checkInId: "3ba9b90a-8b0c-4aeb-9a65-2ea2787fc932",
    messages: [
      message("u1", "user", "We had a calm garden walk"),
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "step-start" }, { type: "text", text: "How was her mood?" }],
      },
    ],
  });

  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data?.messages[1].parts, [{ type: "text", text: "How was her mood?" }]);
});

test("rejects oversized message lists and text parts", () => {
  const valid = { orgSlug: "happy-tails", checkInId: "3ba9b90a-8b0c-4aeb-9a65-2ea2787fc932" };

  assert.equal(interviewRequestSchema.safeParse({
    ...valid,
    messages: Array.from({ length: 41 }, (_, index) => message(String(index), "user", "hello")),
  }).success, false);
  assert.equal(interviewRequestSchema.safeParse({
    ...valid,
    messages: [message("1", "user", "x".repeat(2001))],
  }).success, false);
  assert.equal(interviewRequestSchema.safeParse({
    ...valid,
    messages: [{ id: "a1", role: "assistant", parts: [{ type: "step-start" }] }],
  }).success, false);
  assert.equal(interviewRequestSchema.safeParse({ ...valid, messages: [] }).success, true);
});
