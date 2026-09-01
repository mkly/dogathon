import { createHash } from "node:crypto";

export type SchedulerEnvironment = Record<string, string | undefined>;

export function isAuthorizedSchedulerRequest(
  request: Request,
  env: SchedulerEnvironment,
): boolean {
  const secret = env.CRON_SECRET?.trim() || env.ROSTER_SYNC_DRAIN_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const supplied = authorization.slice("Bearer ".length);
  return createHash("sha256").update(supplied).digest().equals(
    createHash("sha256").update(secret).digest(),
  );
}
