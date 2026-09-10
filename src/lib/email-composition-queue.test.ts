import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, test } from "node:test";

import pg from "pg";
import { PgBoss } from "pg-boss";

import {
  createEmailCompositionQueue,
  EMAIL_COMPOSITION_EXPIRE_SECONDS,
  EmailCompositionJobNotFoundError,
  EMAIL_COMPOSITION_QUEUE,
  EMAIL_COMPOSITION_RETRY_LIMIT,
} from "./email-composition-queue.ts";
import { env } from "./env.ts";

const sourceDatabaseUrl = env.DATABASE_URL;
const databaseName = `dogathon_email_jobs_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let admin: pg.Client;
let boss: PgBoss;

before(async () => {
  assert.ok(
    sourceDatabaseUrl,
    "DATABASE_URL is required for email composition queue tests",
  );
  const url = new URL(sourceDatabaseUrl);
  admin = new pg.Client({ connectionString: sourceDatabaseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  boss = new PgBoss({ connectionString: url.toString() });
  await boss.start();
  await boss.createQueue(EMAIL_COMPOSITION_QUEUE, {
    policy: "exclusive",
    retryLimit: EMAIL_COMPOSITION_RETRY_LIMIT,
    expireInSeconds: EMAIL_COMPOSITION_EXPIRE_SECONDS,
  });
});

after(async () => {
  await boss?.stop();
  if (!admin) return;
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
    [databaseName],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
});

afterEach(async () => {
  await boss.deleteAllJobs(EMAIL_COMPOSITION_QUEUE);
});

function regularInput(targetId = randomUUID(), orgId = randomUUID()) {
  return {
    orgId,
    requestedByUserId: randomUUID(),
    kind: "regular" as const,
    targetId,
  };
}

test("concurrent requests for one target reuse one durable job", async () => {
  const queue = createEmailCompositionQueue(boss);
  const input = regularInput();
  const jobs = await Promise.all(
    Array.from({ length: 8 }, () => queue.enqueue(input)),
  );

  assert.equal(new Set(jobs.map(({ id }) => id)).size, 1);
  assert.equal(new Set(jobs.map(({ draftId }) => draftId)).size, 1);
  assert.ok(jobs.every(({ status }) => status === "queued"));
});

test("exclusive singleton keys allow independent targets to queue", async () => {
  const queue = createEmailCompositionQueue(boss);
  const orgId = randomUUID();
  const [first, second] = await Promise.all([
    queue.enqueue(regularInput(randomUUID(), orgId)),
    queue.enqueue(regularInput(randomUUID(), orgId)),
  ]);

  assert.notEqual(first.id, second.id);
});

test("job status is scoped to the requesting organization", async () => {
  const queue = createEmailCompositionQueue(boss);
  const input = regularInput();
  const job = await queue.enqueue(input);

  assert.equal((await queue.get(input.orgId, job.id)).id, job.id);
  await assert.rejects(
    queue.get(randomUUID(), job.id),
    EmailCompositionJobNotFoundError,
  );
});

test("failed jobs return to pg-boss for bounded retry", async () => {
  const queue = createEmailCompositionQueue(boss);
  await queue.enqueue(regularInput());
  const claimed = await queue.fetch();
  assert.ok(claimed);

  const retry = await queue.fail(claimed.id, "temporary failure");
  assert.equal(retry.status, "queued");
  assert.equal(retry.errorMessage, "temporary failure");
  assert.equal((await queue.fetch())?.id, claimed.id);
});
