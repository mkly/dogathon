import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { uuidSchema } from "./uuid.ts";

export const SPONSORSHIP_SELECTION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const payloadSchema = z.object({
  sponsorshipId: uuidSchema,
  expiresAt: z.number().int().positive(),
});

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSponsorshipSelectionToken(
  sponsorshipId: string,
  secret: string,
  now = new Date(),
) {
  const payload = Buffer.from(JSON.stringify({
    sponsorshipId: uuidSchema.parse(sponsorshipId),
    expiresAt: now.getTime() + SPONSORSHIP_SELECTION_TOKEN_TTL_MS,
  })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySponsorshipSelectionToken(
  token: string,
  secret: string,
  now = new Date(),
): { sponsorshipId: string } | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra !== undefined) return null;

  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.expiresAt <= now.getTime()) return null;
    return { sponsorshipId: parsed.data.sponsorshipId };
  } catch {
    return null;
  }
}

export function sponsorshipSelectionUrl(
  origin: string,
  orgSlug: string,
  sponsorshipId: string,
  secret: string,
  now = new Date(),
) {
  const url = new URL(`/${encodeURIComponent(orgSlug)}/sponsor/next`, origin);
  url.searchParams.set("token", createSponsorshipSelectionToken(sponsorshipId, secret, now));
  return url.toString();
}
