import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { composePupdate } from "./composer.ts";

const originalApiKey = process.env.ANTHROPIC_API_KEY;

before(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

after(() => {
  if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalApiKey;
});

test("composes a grounded regular pupdate without credentials", async () => {
  const draft = await composePupdate({
    dog: { name: "Biscuit", personality: "Playful" },
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
