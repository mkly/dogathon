import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { composeSponsorUpdate } from "./composer.ts";
import { env } from "./env.ts";

const originalEnvironment = {
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  OPENAI_BASE_URL: env.OPENAI_BASE_URL,
  OPENAI_MODEL: env.OPENAI_MODEL,
  features: env.features,
};
const originalFetch = globalThis.fetch;

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

test("composes a grounded regular update without credentials", async () => {
  const draft = await composeSponsorUpdate({
    companion: { name: "Biscuit", available: true, breed: "Corgi mix" },
    chats: [{
      completedAt: new Date("2026-08-12T12:00:00Z"),
      transcript: ["Volunteer: Biscuit chased a ball.", "Volunteer: Then she took a nap."],
      photos: [],
    }],
    pinnedPostscript: "Come meet us at Saturday's adoption fair.",
    type: "regular",
    companionPageUrl: "{{companionPageUrl}}",
  });

  assert.match(draft.subject, /Biscuit/u);
  assert.match(draft.teaser, /Biscuit/u);
  assert.match(draft.bodyText, /chased a ball/u);
  assert.match(draft.bodyText, /took a nap/u);
  assert.ok(draft.bodyText.endsWith("Come meet us at Saturday's adoption fair."));
});

test("appends a Markdown postscript verbatim", async () => {
  const postscript = "**Bold**\n\n[Link](https://example.org)\n\n## Heading\n\n- A bullet";
  const draft = await composeSponsorUpdate({
    companion: { name: "Biscuit", available: true },
    chats: [],
    pinnedPostscript: postscript,
    type: "regular",
    companionPageUrl: "https://pawcast.test/companions/biscuit",
  });

  assert.ok(draft.bodyText.endsWith(postscript));
  assert.equal(draft.bodyText.slice(-postscript.length), postscript);
});

test("uses the configured chat-completions endpoint and model", async () => {
  env.OPENAI_API_KEY = "test-key";
  env.OPENAI_BASE_URL = "https://model.example/v1";
  env.OPENAI_MODEL = "rescue-writer";
  env.features = Object.freeze({ ...env.features, ai: true });
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      choices: [{ message: { content: JSON.stringify({
        subject: "Biscuit made a new friend",
        teaser: "Biscuit had a bright afternoon at the park.",
        bodyText: "Biscuit had fun meeting a new friend at the park.",
        captions: [],
      }) } }],
    });
  };

  await composeSponsorUpdate({
    companion: { name: "Biscuit", available: true, breed: "Corgi mix", sex: "Female", ageText: "Adult" },
    chats: [{
      completedAt: new Date("2026-08-12T12:00:00Z"),
      transcript: ["Volunteer: Biscuit met a new friend at the park."],
      photos: [],
    }],
    pinnedPostscript: "**A permanent note**",
    type: "regular",
    companionPageUrl: "{{companionPageUrl}}",
  });

  assert.ok(requestBody);
  assert.ok(requestHeaders);
  assert.equal(requestUrl, "https://model.example/v1/chat/completions");
  assert.equal(requestHeaders.get("authorization"), "Bearer test-key");
  assert.equal(requestBody.model, "rescue-writer");

  const messages = requestBody.messages as Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
  assert.equal(messages[0].role, "system");
  assert.match(String(messages[0].content), /warm animal-rescue update/u);
  assert.ok(Array.isArray(messages[1].content));
  const promptText = messages[1].content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  assert.match(promptText, /Biscuit met a new friend/u);
  assert.match(promptText, /Breed: Corgi mix/u);
  assert.doesNotMatch(promptText, /A permanent note/u);
});

test("refuses a regular update for an unavailable companion", async () => {
  await assert.rejects(
    composeSponsorUpdate({
      companion: { name: "Biscuit", available: false },
      chats: [],
      pinnedPostscript: "",
      type: "regular",
      companionPageUrl: "https://rescue.example/companions/biscuit",
    }),
    /regular updates require an available companion/u,
  );
});
