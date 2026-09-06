import { createHash } from "node:crypto";

import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const RATE_LIMITS = {
  sponsorshipCheckout: { limit: 5, windowMs: 60 * 60 * 1000 },
  volunteerCheckIn: { limit: 20, windowMs: 60 * 60 * 1000 },
  volunteerPhotoUpload: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;

export type RateLimitStore = { increment(bucket: string, expiresAt: Date): Promise<number>; pruneExpired(now: Date): Promise<void> };

const prismaRateLimitStore: RateLimitStore = {
  async increment(bucket, expiresAt) {
    const result = await prisma.rateLimitBucket.upsert({ where: { bucket }, create: { bucket, count: 1, expiresAt }, update: { count: { increment: 1 }, expiresAt }, select: { count: true } });
    return result.count;
  },
  async pruneExpired(now) { await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } }); },
};

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

export async function getRateLimitIdentity(requestHeaders: Headers): Promise<string> {
  const session = await getSession(requestHeaders);
  if (session) return `user:${session.user.id}`;
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwardedFor || requestHeaders.get("x-real-ip") || "unknown"}`;
}
