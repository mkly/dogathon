import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type { UIMessage } from "ai";

import { interviewTurn } from "./volunteer-interview.ts";
import { interviewRequestSchema } from "./volunteer-interview-request.ts";
import { messageText } from "./ui-message-text.ts";
import { env } from "./env.ts";

const companion = {
  name: "Biscuit",
  breed: "Corgi mix",
  sex: "Female",
  ageText: "Adult",
};
const originalEnvironment = {
  OPENAI_API_KEY: env.OPENAI_API_KEY,
  features: env.features,
};

function message(
  id: string,
  role: "user" | "assistant",
  text: string,
): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

before(() => {
  env.OPENAI_API_KEY = undefined;
  env.features = Object.freeze({ ...env.features, ai: false });
});

after(() => {
  env.OPENAI_API_KEY = originalEnvironment.OPENAI_API_KEY;
  env.features = originalEnvironment.features;
});

test("passes the complete text-only turn to the persistence callback", async () => {
  const original = [message("u1", "user", "We walked around the garden")];
  let persisted: UIMessage[] | undefined;
  const response = await interviewTurn(
    { companion, orgName: "Happy Tails", messages: original },
    {
      onFinish(messages) {
        persisted = messages;
      },
    },
  );
  await response.text();

  assert.equal(persisted?.length, 2);
  assert.deepEqual(persisted?.[0], original[0]);
  assert.equal(persisted?.[1].role, "assistant");
  assert.match(persisted ? messageText(persisted[1]) : "", /get up to today/u);
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
        parts: [
          { type: "step-start" },
          { type: "text", text: "How was her mood?" },
        ],
      },
    ],
  });

  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data?.messages[1].parts, [
    { type: "text", text: "How was her mood?" },
  ]);
});

test("rejects oversized message lists and text parts", () => {
  const valid = {
    orgSlug: "happy-tails",
    checkInId: "3ba9b90a-8b0c-4aeb-9a65-2ea2787fc932",
  };

  assert.equal(
    interviewRequestSchema.safeParse({
      ...valid,
      messages: Array.from({ length: 41 }, (_, index) =>
        message(String(index), "user", "hello"),
      ),
    }).success,
    false,
  );
  assert.equal(
    interviewRequestSchema.safeParse({
      ...valid,
      messages: [message("1", "user", "x".repeat(10_001))],
    }).success,
    false,
  );
  assert.equal(
    interviewRequestSchema.safeParse({
      ...valid,
      messages: [
        { id: "a1", role: "assistant", parts: [{ type: "step-start" }] },
      ],
    }).success,
    false,
  );
  assert.equal(
    interviewRequestSchema.safeParse({ ...valid, messages: [] }).success,
    true,
  );
});
