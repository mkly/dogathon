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
    companion: { name: "Biscuit", breed: "Corgi mix" },
    notes: [{ note: "The vet visit went well." }, "Teeth cleaned."],
    pinnedPostscript: "Come meet us at Saturday's adoption fair.",
    type: "regular",
    companionPageUrl: "{{companionPageUrl}}",
  });

  assert.match(draft.subject, /Biscuit/u);
  assert.match(draft.bodyText, /vet visit went well/u);
  assert.match(draft.bodyText, /Teeth cleaned/u);
  assert.match(draft.bodyText, /^## Recent notes$/mu);
  assert.ok(draft.bodyText.endsWith("Come meet us at Saturday's adoption fair."));
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
        bodyText: "Biscuit had fun meeting a new friend at the park.",
      }) } }],
    });
  };

  await composeSponsorUpdate({
    companion: { name: "Biscuit", breed: "Corgi mix", sex: "Female", ageText: "Adult" },
    notes: [{ note: "Had fun and met a new friend at the park." }],
    pinnedPostscript: "",
    type: "regular",
    companionPageUrl: "{{companionPageUrl}}",
  });

  assert.ok(requestBody);
  assert.ok(requestHeaders);
  assert.equal(requestUrl, "https://model.example/v1/chat/completions");
  assert.equal(requestHeaders.get("authorization"), "Bearer test-key");
  assert.equal(requestBody.model, "rescue-writer");

  const messages = requestBody.messages as Array<{ role: string; content: string }>;
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Treat the volunteer notes as the update/u);
  assert.match(messages[0].content, /do not turn the email into a profile or biography/u);
  const promptInput = JSON.parse(messages[1].content) as { companion: Record<string, unknown> };
  assert.deepEqual(promptInput.companion, {
    name: "Biscuit",
    breed: "Corgi mix",
    sex: "Female",
    ageText: "Adult",
  });
  assert.equal("personality" in promptInput.companion, false);
  assert.equal("careNotes" in promptInput.companion, false);
});

test("supports a graduation update", async () => {
  const draft = await composeSponsorUpdate({
    companion: { name: "Biscuit" },
    notes: [{ note: "Biscuit went home with a family today." }],
    pinnedPostscript: "Thank you for being part of the rescue.",
    type: "graduation",
    companionPageUrl: "https://rescue.example/companions/biscuit",
  });

  assert.match(draft.subject, /home/u);
  assert.match(draft.bodyText, /Biscuit/u);
  assert.match(draft.bodyText, /went home with a family/u);
});
