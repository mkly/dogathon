export type EmailCompositionJobStatus =
  "queued" | "composing" | "completed" | "failed";

export type EmailCompositionJobView = {
  id: string;
  status: EmailCompositionJobStatus;
  kind: "regular" | "graduation";
  targetId: string;
  draftId: string | null;
  errorMessage: string | null;
};

export const EMAIL_COMPOSITION_POLL_INTERVAL_MS = 1_000;
export const EMAIL_COMPOSITION_POLL_TIMEOUT_MS = 15 * 60 * 1_000;

export type PendingEmailCompositionJob = {
  id: string;
  success: string;
  status: "queued" | "composing";
  deadline: number;
};

export function pendingEmailCompositionJob(
  job: EmailCompositionJobView,
  success: string,
  now = Date.now(),
): PendingEmailCompositionJob {
  return {
    id: job.id,
    success,
    status: job.status === "composing" ? "composing" : "queued",
    deadline: now + EMAIL_COMPOSITION_POLL_TIMEOUT_MS,
  };
}

export function parsePendingEmailCompositionJob(
  serialized: string,
): PendingEmailCompositionJob | null {
  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (
      typeof value.id !== "string" ||
      typeof value.success !== "string" ||
      (value.status !== "queued" && value.status !== "composing") ||
      typeof value.deadline !== "number" ||
      !Number.isFinite(value.deadline)
    )
      return null;
    return value as PendingEmailCompositionJob;
  } catch {
    return null;
  }
}

export function emailCompositionPollExpired(
  job: PendingEmailCompositionJob,
  now = Date.now(),
) {
  return now >= job.deadline;
}

export function isTerminalEmailCompositionStatus(
  status: EmailCompositionJobStatus,
) {
  return status === "completed" || status === "failed";
}
