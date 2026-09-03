import { constantTimeEqual } from "better-auth/crypto";

export type SchedulerEnvironment = {
  CRON_SECRET?: string;
  ROSTER_SYNC_DRAIN_SECRET?: string;
  ROSTER_SYNC_DRAIN_BUDGET_MS?: string | number;
  ROSTER_SYNC_SCHEDULE_STAGGER_MS?: string | number;
};

export function isAuthorizedSchedulerRequest(
  request: Request,
  env: SchedulerEnvironment,
): boolean {
  const secret = env.CRON_SECRET?.trim() || env.ROSTER_SYNC_DRAIN_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const supplied = authorization.slice("Bearer ".length);
  return constantTimeEqual(supplied, secret);
}
