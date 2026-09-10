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

export function isTerminalEmailCompositionStatus(
  status: EmailCompositionJobStatus,
) {
  return status === "completed" || status === "failed";
}
