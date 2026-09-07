import { createHash, randomUUID } from "node:crypto";

import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const RATE_LIMITS = {
  publicRead: { limit: 120, windowMs: 60 * 1000 },
  sponsorshipCheckout: { limit: 5, windowMs: 60 * 60 * 1000 },
  volunteerCheckIn: { limit: 20, windowMs: 60 * 60 * 1000 },
  volunteerPhotoUpload: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;

export type RateLimitStore = { increment(bucket: string, expiresAt: Date): Promise<number>; pruneExpired(now: Date): Promise<void> };

type RateLimitBucketDelegate = {
  deleteMany(args: { where: { expiresAt: { lte: Date } } }): Promise<unknown>;
  upsert(args: {
    create: { bucket: string; count: number; expiresAt: Date };
    select: { count: true };
    update: { count: { increment: number }; expiresAt: Date };
    where: { bucket: string };
  }): Promise<{ count: number }>;
};

function isUniqueConstraintViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

export function createRateLimitStore(buckets: RateLimitBucketDelegate): RateLimitStore {
  return {
    async increment(bucket, expiresAt) {
      const upsert = () => buckets.upsert({ where: { bucket }, create: { bucket, count: 1, expiresAt }, update: { count: { increment: 1 }, expiresAt }, select: { count: true } });
      try {
        return (await upsert()).count;
      } catch (error) {
        // Concurrent first requests in a window race on the insert; the loser
        // retries and takes the atomic increment path instead of returning 500.
        if (!isUniqueConstraintViolation(error)) throw error;
        return (await upsert()).count;
      }
    },
    async pruneExpired(now) { await buckets.deleteMany({ where: { expiresAt: { lte: now } } }); },
  };
}

const prismaRateLimitStore = createRateLimitStore(prisma.rateLimitBucket);

type RateLimitOptions = { identity: string; limit: number; now?: Date; scope: string; store?: RateLimitStore; windowMs: number };

export async function checkRateLimit({ identity, limit, now = new Date(), scope, store = prismaRateLimitStore, windowMs }: RateLimitOptions): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const bucket = createHash("sha256").update(`${scope}:${identity}:${windowStart}`).digest("hex");
  const count = await store.increment(bucket, expiresAt);
  // The first request of a window prunes; later ones reuse the row instead of
  // issuing a delete on every call.
  if (count === 1) await store.pruneExpired(now);
  return { allowed: count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)) };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json({ error: "Too many requests. Please try again later." }, { headers: { "Retry-After": String(retryAfterSeconds) }, status: 429 });
}

export function anonymousRateLimitIdentity(requestHeaders: Headers, requestId: string = randomUUID()) {
  const platformIp = requestHeaders.get("x-real-ip")?.trim();
  if (platformIp) return `ip:${platformIp}`;
  const forwardedFor = requestHeaders.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  return forwardedFor ? `ip:${forwardedFor}` : `request:${requestId}`;
}

export async function getRateLimitIdentity(requestHeaders: Headers): Promise<string> {
  const session = await getSession(requestHeaders);
  if (session) return `user:${session.user.id}`;
  return anonymousRateLimitIdentity(requestHeaders);
}
