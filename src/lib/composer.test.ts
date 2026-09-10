import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  buildComposerMessages,
  composeSponsorUpdate,
  type ComposeSponsorUpdateInput,
} from "./composer.ts";
import { env } from "./env.ts";

const originalEnvironment = {
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  features: env.features,
};

before(() => {
  env.OPENAI_API_KEY = undefined;
  env.features = Object.freeze({ ...env.features, ai: false });
});

after(() => {
  env.OPENAI_API_KEY = originalEnvironment.OPENAI_API_KEY;
  env.features = originalEnvironment.features;
});

function regularInput(
  chats: ComposeSponsorUpdateInput["chats"],
): ComposeSponsorUpdateInput {
  return {
    companion: {
      name: "Biscuit",
      available: true,
      personality:
        "A very long profile must not make a thin volunteer note look rich.",
    },
    chats,
    pinnedPostscript: "Thanks for supporting our rescue.",
    type: "regular",
    companionPageUrl: "https://rescue.example/companions/biscuit",
  };
}

function textContent(
  message: Awaited<ReturnType<typeof buildComposerMessages>>,
) {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

test("builds a short brief for one sparse visit", async () => {
  const message = await buildComposerMessages(
    regularInput([
      {
        completedAt: new Date("2026-08-12T12:00:00Z"),
        transcript: [
          "Interviewer: Please describe every detail you can remember, including the setting and your feelings.",
          "Volunteer: Biscuit chased a ball, then curled up for a nap.",
        ],
        photos: [],
      },
    ]),
  );
  const content = textContent(message);

  assert.match(content, /1 visit and 10 words of volunteer observations/u);
  assert.match(content, /generally 40 to 100 words/u);
  assert.match(content, /hard maximum of 120 words/u);
  assert.match(content, /Do not use headings/u);
  assert.match(
    content,
    /Interviewer wording, photo count, and profile length never justify/u,
  );
});

test("allows more room only for rich multi-visit observations", async () => {
  const observations = [
    "Biscuit greeted us at the gate, carried her blue ball across the yard, practiced waiting before treats, walked calmly beside two new volunteers, splashed in the shallow pool, and settled on her blanket afterward.",
    "During the next visit, Biscuit chose the shady path, stopped to sniff rosemary near the fence, shared a quiet greeting with another dog, and returned inside when called for dinner.",
    "On Friday, Biscuit worked through a puzzle feeder, brought a rope toy to Maya, rested while the kennel was cleaned, and leaned into gentle shoulder scratches before bedtime.",
  ];
  const chats = ["2026-08-10", "2026-08-12", "2026-08-14"].map(
    (day, index) => ({
      completedAt: new Date(`${day}T12:00:00Z`),
      transcript: [
        `Interviewer: Question ${index + 1}`,
        `Volunteer: ${observations[index]}`,
      ],
      photos: [],
    }),
  );
  const content = textContent(await buildComposerMessages(regularInput(chats)));

  const observationCount = content.match(
    /3 visits and (\d+) words of volunteer observations/u,
  );
  assert.ok(observationCount);
  assert.ok(Number(observationCount[1]) >= 80);
  assert.match(content, /is rich/u);
  assert.match(content, /generally 100 to 220 words/u);
  assert.match(content, /hard maximum of 250 words/u);

  const repeatedContent = textContent(
    await buildComposerMessages(
      regularInput(
        chats.map((chat) => ({
          ...chat,
          transcript: [`Volunteer: ${observations[0]}`],
        })),
      ),
    ),
  );
  assert.match(repeatedContent, /3 visits and 34 words/u);
  assert.match(repeatedContent, /is sparse/u);
});

test("composes a grounded regular update without credentials", async () => {
  const draft = await composeSponsorUpdate({
    companion: { name: "Biscuit", available: true, breed: "Corgi mix" },
    chats: [
      {
        completedAt: new Date("2026-08-12T12:00:00Z"),
        transcript: [
          "Volunteer: Biscuit chased a ball.",
          "Volunteer: Then she took a nap.",
        ],
        photos: [],
      },
    ],
    pinnedPostscript: "Come meet us at Saturday's adoption fair.",
    type: "regular",
    companionPageUrl: "{{companionPageUrl}}",
  });

  assert.match(draft.subject, /Biscuit/u);
  assert.match(draft.teaser, /Biscuit/u);
  assert.match(draft.bodyText, /chased a ball/u);
  assert.match(draft.bodyText, /took a nap/u);
  assert.doesNotMatch(draft.bodyText, /Volunteer:|On August/u);
  assert.ok(draft.bodyText.split(/\s+/u).length <= 120);
  assert.ok(
    draft.bodyText.endsWith("Come meet us at Saturday's adoption fair."),
  );
});

test("appends a Markdown postscript verbatim", async () => {
  const postscript =
    "**Bold**\n\n[Link](https://example.org)\n\n## Heading\n\n- A bullet";
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

test("passes the composition deadline to local photo fetches", async () => {
  const originalFetch = globalThis.fetch;
  const signal = AbortSignal.timeout(1_000);
  let receivedSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (_input, init) => {
    receivedSignal = init?.signal;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };

  try {
    await buildComposerMessages({
      signal,
      companion: { name: "Biscuit", available: true },
      chats: [
        {
          completedAt: new Date("2026-08-12T12:00:00Z"),
          transcript: ["Volunteer: Biscuit chased a ball."],
          photos: [
            {
              id: "photo-1",
              url: "/uploads/biscuit.jpg",
              takenAt: new Date("2026-08-12T12:00:00Z"),
            },
          ],
        },
      ],
      pinnedPostscript: "",
      type: "regular",
      companionPageUrl: "https://rescue.example/companions/biscuit",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(receivedSignal, signal);
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
    chats: [
      {
        completedAt: new Date("2026-09-01T12:00:00Z"),
        transcript: [
          "Volunteer: Biscuit spent the afternoon curled up in the sun.",
        ],
        photos: [],
      },
    ],
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
