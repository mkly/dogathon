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

test("uses the existing graduation draft as the adoption-story seed", async () => {
  const draft = await composeSponsorUpdate({
    companion: { name: "Biscuit", available: false },
    chats: [{
      completedAt: new Date("2026-09-01T12:00:00Z"),
      transcript: ["Volunteer: Biscuit spent the afternoon curled up in the sun."],
      photos: [],
    }],
    previousUpdate: {
      sentAt: new Date("2026-09-02T12:00:00Z"),
      bodyText: "Biscuit has been adopted and is heading home.",
    },
    pinnedPostscript: "",
    type: "graduation",
    companionPageUrl: "https://rescue.example/companions/biscuit",
  });

  assert.match(draft.subject, /found a home/u);
  assert.match(draft.teaser, /found a home/u);
  assert.match(draft.bodyText, /has been adopted/u);
  assert.match(draft.bodyText, /curled up in the sun/u);
});
