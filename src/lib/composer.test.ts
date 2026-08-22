import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { composePupdate } from "./composer.ts";

const originalApiKey = process.env.ANTHROPIC_API_KEY;
const originalFetch = globalThis.fetch;

before(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  globalThis.fetch = originalFetch;
});

after(() => {
  if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalApiKey;
  globalThis.fetch = originalFetch;
});

test("composes a grounded regular pupdate without credentials", async () => {
  const draft = await composePupdate({
    dog: { name: "Biscuit", breed: "Corgi mix" },
    notes: [{ note: "The vet visit went well." }, "Teeth cleaned."],
    pinnedPostscript: "Come meet us at Saturday's adoption fair.",
    type: "regular",
    dogPageUrl: "{{dogPageUrl}}",
  });

  assert.match(draft.subject, /Biscuit/u);
  assert.match(draft.bodyText, /vet visit went well/u);
  assert.match(draft.bodyText, /Teeth cleaned/u);
  assert.ok(draft.bodyText.endsWith("Come meet us at Saturday's adoption fair."));
  assert.match(draft.smsText, /\{\{dogPageUrl\}\}/u);
  assert.ok(draft.smsText.length < 300);
});

test("frames volunteer notes as the news in Anthropic regular-update prompts", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      content: [{
        type: "text",
        text: JSON.stringify({
          subject: "Biscuit made a new friend",
          bodyText: "Biscuit had fun meeting a new friend at the park.",
          smsText: "Biscuit made a new friend. See the update: {{dogPageUrl}}",
        }),
      }],
    });
  };

  await composePupdate({
    dog: { name: "Biscuit", breed: "Corgi mix", sex: "Female", ageText: "Adult" },
    notes: [{ note: "Had fun and met a new friend at the park." }],
    pinnedPostscript: "",
    type: "regular",
    dogPageUrl: "{{dogPageUrl}}",
  });

  assert.ok(requestBody);
  assert.match(String(requestBody.system), /Treat the volunteer notes as the update/u);
  assert.match(String(requestBody.system), /do not turn the email into a profile or biography/u);

  const messages = requestBody.messages as Array<{ content: string }>;
  const promptInput = JSON.parse(messages[0].content) as { dog: Record<string, unknown> };
  assert.deepEqual(promptInput.dog, {
    name: "Biscuit",
    breed: "Corgi mix",
    sex: "Female",
    ageText: "Adult",
  });
  assert.equal("personality" in promptInput.dog, false);
  assert.equal("careNotes" in promptInput.dog, false);
});

test("supports a graduation pupdate", async () => {
  const draft = await composePupdate({
    dog: { name: "Biscuit" },
    notes: [{ note: "Biscuit went home with a family today." }],
    pinnedPostscript: "Thank you for being part of the rescue.",
    type: "graduation",
    dogPageUrl: "https://rescue.example/dogs/biscuit",
  });

  assert.match(draft.subject, /home/u);
  assert.match(draft.bodyText, /Biscuit/u);
  assert.match(draft.bodyText, /went home with a family/u);
  assert.match(draft.smsText, /adopted today/u);
  assert.match(draft.smsText, /https:\/\/rescue\.example\/dogs\/biscuit/u);
  assert.ok(draft.smsText.length < 300);
});
