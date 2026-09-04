import { constantTimeEqual } from "better-auth/crypto";

import type { AppEnvironment } from "./env.ts";

export type SchedulerEnvironment = Pick<
  AppEnvironment,
  | "CRON_SECRET"
  | "ROSTER_SYNC_DRAIN_BUDGET_MS"
  | "ROSTER_SYNC_SCHEDULE_STAGGER_MS"
  | "features"
>;

export function isAuthorizedSchedulerRequest(
  request: Request,
  env: SchedulerEnvironment,
): boolean {
  if (!env.features.scheduler) return false;
  const secret = env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const supplied = authorization.slice("Bearer ".length);
  return constantTimeEqual(supplied, secret);
}
