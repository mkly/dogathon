import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { composeSponsorUpdate } from "./composer.ts";
import { env } from "./env.ts";

const originalEnvironment = { OPENAI_API_KEY: env.OPENAI_API_KEY, features: env.features };

before(() => {
  env.OPENAI_API_KEY = undefined;
  env.features = Object.freeze({ ...env.features, ai: false });
});

after(() => {
  env.OPENAI_API_KEY = originalEnvironment.OPENAI_API_KEY;
  env.features = originalEnvironment.features;
});

test("composes a grounded regular update without credentials", async () => {
  const draft = await composeSponsorUpdate({
    companion: { name: "Biscuit", available: true, breed: "Corgi mix" },
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

test("appends a Markdown postscript verbatim", async () => {
  const postscript = "**Bold**\n\n[Link](https://example.org)\n\n## Heading\n\n- A bullet";
  const draft = await composeSponsorUpdate({
    companion: { name: "Biscuit", available: true },
    notes: ["Played fetch."],
    pinnedPostscript: postscript,
    type: "regular",
    companionPageUrl: "https://pawcast.test/companions/biscuit",
  });

  assert.ok(draft.bodyText.endsWith(postscript));
  assert.equal(draft.bodyText.slice(-postscript.length), postscript);
});

test("supports a graduation update", async () => {
  const draft = await composeSponsorUpdate({
    companion: { name: "Biscuit", available: false },
    notes: [{ note: "Biscuit went home with a family today." }],
    pinnedPostscript: "Thank you for being part of the rescue.",
    type: "graduation",
    companionPageUrl: "https://rescue.example/companions/biscuit",
  });

  assert.match(draft.subject, /home/u);
  assert.match(draft.bodyText, /Biscuit/u);
  assert.match(draft.bodyText, /went home with a family/u);
});

test("refuses a regular update for an unavailable companion", async () => {
  await assert.rejects(
    composeSponsorUpdate({
      companion: { name: "Biscuit", available: false },
      notes: [],
      pinnedPostscript: "",
      type: "regular",
      companionPageUrl: "https://rescue.example/companions/biscuit",
    }),
    /regular updates require an available companion/u,
  );
});
