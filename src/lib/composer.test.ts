import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { composePupdate } from "./composer.ts";

const originalEnvironment = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
};
const originalFetch = globalThis.fetch;

before(() => {
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
  globalThis.fetch = originalFetch;
});

after(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
});

test("composes a grounded regular pupdate without credentials", async () => {
  const draft = await composePupdate({
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
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_BASE_URL = "https://model.example/v1/";
  process.env.OPENAI_MODEL = "rescue-writer";
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

  await composePupdate({
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

test("supports a graduation pupdate", async () => {
  const draft = await composePupdate({
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
