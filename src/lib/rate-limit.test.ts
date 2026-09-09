import assert from "node:assert/strict";
import test from "node:test";
import {
  anonymousRateLimitIdentity,
  checkRateLimit,
  createRateLimitStore,
  type RateLimitStore,
} from "./rate-limit.ts";

function memoryStore(): RateLimitStore & {
  buckets: Map<string, { count: number; expiresAt: Date }>;
} {
  const buckets = new Map<string, { count: number; expiresAt: Date }>();
  return {
    buckets,
    async increment(bucket, expiresAt) {
      const count = (buckets.get(bucket)?.count ?? 0) + 1;
      buckets.set(bucket, { count, expiresAt });
      return count;
    },
    async pruneExpired(now) {
      for (const [bucket, value] of buckets)
        if (value.expiresAt <= now) buckets.delete(bucket);
    },
  };
}

test("rate limiter allows requests through its configured limit then blocks", async () => {
  const store = memoryStore();
  const input = {
    identity: "user:1",
    limit: 2,
    now: new Date("2026-09-06T12:00:00Z"),
    scope: "test",
    store,
    windowMs: 60_000,
  };
  assert.equal((await checkRateLimit(input)).allowed, true);
  assert.equal((await checkRateLimit(input)).allowed, true);
  assert.equal((await checkRateLimit(input)).allowed, false);
});

test("rate limiter resets when the fixed window advances", async () => {
  const store = memoryStore();
  const input = {
    identity: "ip:127.0.0.1",
    limit: 1,
    scope: "test",
    store,
    windowMs: 60_000,
  };
  assert.equal(
    (await checkRateLimit({ ...input, now: new Date("2026-09-06T12:00:59Z") }))
      .allowed,
    true,
  );
  assert.equal(
    (await checkRateLimit({ ...input, now: new Date("2026-09-06T12:01:00Z") }))
      .allowed,
    true,
  );
});

test("rate limiter prunes expired buckets", async () => {
  const store = memoryStore();
  const input = {
    identity: "user:2",
    limit: 5,
    scope: "test",
    store,
    windowMs: 60_000,
  };
  await checkRateLimit({ ...input, now: new Date("2026-09-06T12:00:00Z") });
  assert.equal(store.buckets.size, 1);
  await checkRateLimit({ ...input, now: new Date("2026-09-06T12:01:00Z") });
  assert.equal(store.buckets.size, 1);
});

test("anonymous rate limits use a trusted platform IP, then the last forwarded hop", () => {
  assert.equal(
    anonymousRateLimitIdentity(
      new Headers({
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "client, proxy",
      }),
    ),
    "ip:203.0.113.10",
  );
  assert.equal(
    anonymousRateLimitIdentity(
      new Headers({ "x-forwarded-for": "client, proxy" }),
    ),
    "ip:proxy",
  );
  assert.equal(
    anonymousRateLimitIdentity(new Headers(), "request-a"),
    "request:request-a",
  );
});

test("a first-insert unique-constraint race retries instead of failing the request", async () => {
  let attempts = 0;
  const store = createRateLimitStore({
    async deleteMany() {
      return undefined;
    },
    async upsert() {
      attempts += 1;
      if (attempts === 1)
        throw Object.assign(new Error("Unique constraint failed"), {
          code: "P2002",
        });
      return { count: 2 };
    },
  });

  assert.equal(
    await store.increment("bucket", new Date("2026-09-06T13:00:00Z")),
    2,
  );
  assert.equal(attempts, 2);
});

test("a non-race store failure still propagates", async () => {
  const store = createRateLimitStore({
    async deleteMany() {
      return undefined;
    },
    async upsert() {
      throw Object.assign(new Error("connection lost"), { code: "P1001" });
    },
  });

  await assert.rejects(
    () => store.increment("bucket", new Date()),
    /connection lost/u,
  );
});
