import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimit, type RateLimitStore } from "./rate-limit.ts";

function memoryStore(): RateLimitStore & { buckets: Map<string, { count: number; expiresAt: Date }> } {
  const buckets = new Map<string, { count: number; expiresAt: Date }>();
  return {
    buckets,
    async increment(bucket, expiresAt) { const count = (buckets.get(bucket)?.count ?? 0) + 1; buckets.set(bucket, { count, expiresAt }); return count; },
    async pruneExpired(now) { for (const [bucket, value] of buckets) if (value.expiresAt <= now) buckets.delete(bucket); },
  };
}

test("rate limiter allows requests through its configured limit then blocks", async () => {
  const store = memoryStore();
  const input = { identity: "user:1", limit: 2, now: new Date("2026-09-06T12:00:00Z"), scope: "test", store, windowMs: 60_000 };
  assert.equal((await checkRateLimit(input)).allowed, true);
  assert.equal((await checkRateLimit(input)).allowed, true);
  assert.equal((await checkRateLimit(input)).allowed, false);
});

test("rate limiter resets when the fixed window advances", async () => {
  const store = memoryStore();
  const input = { identity: "ip:127.0.0.1", limit: 1, scope: "test", store, windowMs: 60_000 };
  assert.equal((await checkRateLimit({ ...input, now: new Date("2026-09-06T12:00:59Z") })).allowed, true);
  assert.equal((await checkRateLimit({ ...input, now: new Date("2026-09-06T12:01:00Z") })).allowed, true);
});

test("rate limiter prunes expired buckets", async () => {
  const store = memoryStore();
  const input = { identity: "user:2", limit: 5, scope: "test", store, windowMs: 60_000 };
  await checkRateLimit({ ...input, now: new Date("2026-09-06T12:00:00Z") });
  assert.equal(store.buckets.size, 1);
  await checkRateLimit({ ...input, now: new Date("2026-09-06T12:01:00Z") });
  assert.equal(store.buckets.size, 1);
});
