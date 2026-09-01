import "dotenv/config";

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "@/generated/prisma/client";

import { createRosterSyncJobQueue } from "./roster-sync-jobs.ts";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceDatabaseUrl = process.env.DATABASE_URL;
const databaseName = `dogathon_roster_jobs_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let databaseUrl = "";
let admin: pg.Client;
let db: PrismaClient;

before(async () => {
  assert.ok(sourceDatabaseUrl, "DATABASE_URL is required for roster sync job tests");
  const url = new URL(sourceDatabaseUrl);
  admin = new pg.Client({ connectionString: sourceDatabaseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  databaseUrl = url.toString();

  await execFileAsync("./node_modules/.bin/prisma", ["migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
});

after(async () => {
  await db?.$disconnect();
  if (!admin) return;
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
    [databaseName],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
});

async function createOrganization() {
  const id = randomUUID();
  await db.organization.create({
    data: { id, name: `Rescue ${id}`, slug: `rescue-${id}`, createdAt: new Date() },
  });
  return id;
}

function requiredClaimToken(token: string | null) {
  assert.ok(token);
  return token;
}

test("concurrent enqueues return one active job per organization", async () => {
  const orgId = await createOrganization();
  const queue = createRosterSyncJobQueue(db);

  const jobs = await Promise.all(
    Array.from({ length: 8 }, () => queue.enqueue({ orgId })),
  );

  assert.equal(new Set(jobs.map((job) => job.id)).size, 1);
  assert.equal(await db.rosterSyncJob.count({ where: { orgId } }), 1);
});

test("two concurrent claimers cannot claim the same job", async () => {
  const orgId = await createOrganization();
  const queue = createRosterSyncJobQueue(db);
  await queue.enqueue({ orgId });
  const now = new Date("2026-09-01T12:00:00.000Z");

  const claims = await Promise.all([
    queue.claim({ orgId, now }),
    queue.claim({ orgId, now }),
  ]);
  const claimed = claims.filter((job) => job !== null);

  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]?.status, "running");
  assert.equal(claimed[0]?.attempts, 1);
  assert.equal(claimed[0]?.heartbeatAt?.toISOString(), now.toISOString());
});

test("an expired lease is reclaimed and increments the attempt count", async () => {
  const orgId = await createOrganization();
  const queue = createRosterSyncJobQueue(db);
  const job = await queue.enqueue({ orgId });
  const first = await queue.claim({
    orgId,
    now: new Date("2026-09-01T12:00:00.000Z"),
    leaseMs: 1_000,
  });
  assert.ok(first);

  const reclaimed = await queue.claim({
    orgId,
    now: new Date("2026-09-01T12:00:01.001Z"),
    leaseMs: 1_000,
  });

  assert.equal(reclaimed?.id, job.id);
  assert.equal(reclaimed?.attempts, 2);
  assert.notEqual(reclaimed?.claimToken, first.claimToken);
});

test("terminal transitions record a summary or refusal reason", async () => {
  const queue = createRosterSyncJobQueue(db);
  const successOrgId = await createOrganization();
  await queue.enqueue({ orgId: successOrgId });
  const successClaim = await queue.claim({ orgId: successOrgId });
  assert.ok(successClaim);
  const summary = {
    created: 2,
    updated: 3,
    adopted: 1,
    restored: 0,
    sponsorshipsClosed: 1,
    usedFallbackCapture: false,
    source: "https://rescue.example/dogs",
  };

  const succeeded = await queue.succeed({
    orgId: successOrgId,
    jobId: successClaim.id,
    claimToken: requiredClaimToken(successClaim.claimToken),
    summary,
  });
  assert.equal(succeeded.status, "succeeded");
  assert.deepEqual(succeeded.summary, summary);
  assert.ok(succeeded.finishedAt);

  const refusedOrgId = await createOrganization();
  await queue.enqueue({ orgId: refusedOrgId });
  const refusedClaim = await queue.claim({ orgId: refusedOrgId });
  assert.ok(refusedClaim);
  const refused = await queue.refuse({
    orgId: refusedOrgId,
    jobId: refusedClaim.id,
    claimToken: requiredClaimToken(refusedClaim.claimToken),
    reason: "The parsed roster would adopt most residents",
  });
  assert.equal(refused.status, "refused");
  assert.equal(refused.refusalReason, "The parsed roster would adopt most residents");
  assert.equal(refused.summary, null);
});

test("the maximum attempt count turns the last error into a terminal failure", async () => {
  const orgId = await createOrganization();
  const queue = createRosterSyncJobQueue(db);
  await queue.enqueue({ orgId, maxAttempts: 2 });

  const first = await queue.claim({ orgId });
  assert.ok(first);
  const retry = await queue.fail({
    orgId,
    jobId: first.id,
    claimToken: requiredClaimToken(first.claimToken),
    error: "first failure",
  });
  assert.equal(retry.status, "queued");

  const second = await queue.claim({ orgId });
  assert.ok(second);
  const failed = await queue.fail({
    orgId,
    jobId: second.id,
    claimToken: requiredClaimToken(second.claimToken),
    error: "last failure",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.attempts, 2);
  assert.equal(failed.errorMessage, "last failure");
  assert.ok(failed.finishedAt);
});
