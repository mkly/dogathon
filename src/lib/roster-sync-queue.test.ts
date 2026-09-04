import "dotenv/config";

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, afterEach, before, test } from "node:test";

import pg from "pg";
import { PgBoss } from "pg-boss";

import {
  createRosterSyncQueue,
  ROSTER_SYNC_EXPIRE_SECONDS,
  ROSTER_SYNC_QUEUE,
  ROSTER_SYNC_RETRY_LIMIT,
} from "./roster-sync-queue.ts";
import { createRosterSyncDrainer } from "./roster-sync-worker.ts";
import { env, subprocessEnvironment } from "./env.ts";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceDatabaseUrl = env.DATABASE_URL;
const databaseName = `dogathon_pgboss_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let admin: pg.Client;
let database: pg.Client;
let boss: PgBoss;

before(async () => {
  assert.ok(sourceDatabaseUrl, "DATABASE_URL is required for roster sync queue tests");
  const url = new URL(sourceDatabaseUrl);
  admin = new pg.Client({ connectionString: sourceDatabaseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  const databaseUrl = url.toString();
  database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();

  await execFileAsync("./node_modules/.bin/prisma", ["migrate", "deploy"], {
    cwd: repoRoot,
    env: subprocessEnvironment({ DATABASE_URL: databaseUrl }),
  });
  boss = new PgBoss({ connectionString: databaseUrl });
  await boss.start();
  await boss.createQueue(ROSTER_SYNC_QUEUE, {
    policy: "exclusive",
    retryLimit: ROSTER_SYNC_RETRY_LIMIT,
    expireInSeconds: ROSTER_SYNC_EXPIRE_SECONDS,
  });
});

after(async () => {
  await boss?.stop({ graceful: false });
  await database?.end();
  if (!admin) return;
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
    [databaseName],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
});

afterEach(async () => {
  await boss.deleteAllJobs(ROSTER_SYNC_QUEUE);
});

test("the exclusive queue returns one queued job for concurrent organization enqueues", async () => {
  const queue = createRosterSyncQueue(boss);
  const orgId = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => queue.enqueueWithResult({ orgId })),
  );

  assert.equal(results.filter((result) => result.enqueued).length, 1);
  assert.equal(new Set(results.map((result) => result.job.id)).size, 1);
});

test("a manual enqueue pulls an existing staggered job forward", async () => {
  const queue = createRosterSyncQueue(boss);
  const orgId = randomUUID();
  const scheduled = await queue.enqueueWithResult({
    orgId,
    trigger: "scheduled",
    startAfter: new Date(Date.now() + 60 * 60 * 1000),
  });

  assert.equal((await queue.fetch()), null);
  const manual = await queue.enqueueWithResult({ orgId });
  const claimed = await queue.fetch();

  assert.equal(manual.enqueued, false);
  assert.equal(manual.job.id, scheduled.job.id);
  assert.equal(claimed?.id, scheduled.job.id);
});

test("success and refusal outputs map back to the polling view", async () => {
  const queue = createRosterSyncQueue(boss);
  const successOrgId = randomUUID();
  await queue.enqueue({ orgId: successOrgId });
  const successClaim = await queue.fetch();
  assert.ok(successClaim);
  const summary = {
    created: 0,
    updated: 1,
    adopted: 0,
    restored: 0,
    sponsorshipsClosed: 0,
    usedFallbackCapture: false,
    rosterComplete: true,
    rosterCompleteness: {
      complete: true,
      timedOut: false,
      status: "completed",
      completed: 1,
      total: 1,
    },
    source: "https://rescue.example/companions",
  };
  const succeeded = await queue.succeed(successClaim.id, summary);
  assert.equal(succeeded.status, "succeeded");
  assert.deepEqual(succeeded.summary, summary);

  const refusedOrgId = randomUUID();
  await queue.enqueue({ orgId: refusedOrgId });
  const refusedClaim = await queue.fetch();
  assert.ok(refusedClaim);
  const refused = await queue.refuse(refusedClaim.id, "Unsafe roster change");
  assert.equal(refused.status, "refused");
  assert.equal(refused.refusalReason, "Unsafe roster change");
});

test("a failed fetch is returned to pg-boss for retry", async () => {
  const queue = createRosterSyncQueue(boss);
  const orgId = randomUUID();
  await queue.enqueue({ orgId });
  const claimed = await queue.fetch();
  assert.ok(claimed);

  const retry = await queue.fail(claimed.id, "temporary failure");
  assert.equal(retry.status, "queued");
  assert.equal(retry.errorMessage, "temporary failure");
  assert.equal((await queue.fetch())?.id, claimed.id);
});

test("an expired active job is fetchable after supervision", async () => {
  const queue = createRosterSyncQueue(boss);
  const orgId = randomUUID();
  await queue.enqueue({ orgId });
  const claimed = await queue.fetch();
  assert.ok(claimed);

  await database.query("UPDATE pgboss.job_common SET started_on = now() - interval '301 seconds' WHERE id = $1", [
    claimed.id,
  ]);

  assert.equal(await queue.fetch(), null);
  await boss.supervise(ROSTER_SYNC_QUEUE);
  assert.equal((await queue.fetch())?.id, claimed.id);
});

test("the HTTP-invocation drainer fetches and settles a real pg-boss job", async () => {
  const queue = createRosterSyncQueue(boss);
  const orgId = randomUUID();
  const queued = await queue.enqueue({ orgId });
  const drain = createRosterSyncDrainer({
    supervise: () => boss.supervise(ROSTER_SYNC_QUEUE),
    fetch: queue.fetch,
    succeed: queue.succeed,
    refuse: queue.refuse,
    fail: queue.fail,
    syncRoster: async (nextOrgId) => {
      assert.equal(nextOrgId, orgId);
      return {
        created: 1,
        updated: 0,
        adopted: 0,
        restored: 0,
        sponsorshipsClosed: 0,
        usedFallbackCapture: false,
        rosterComplete: true,
        rosterCompleteness: {
          complete: true,
          timedOut: false,
          status: "completed",
          completed: 1,
          total: 1,
        },
        source: "https://rescue.example/companions",
      };
    },
  });

  const result = await drain();

  assert.equal(result.drained, true);
  assert.equal(result.drained && result.job.id, queued.id);
  assert.equal(result.drained && result.job.status, "succeeded");
  assert.equal((await queue.get(orgId, queued.id)).status, "succeeded");
});
