import type { SyncSummary } from "./roster-sync.ts";

export type RosterSyncJobStatus = "queued" | "running" | "succeeded" | "failed" | "refused";
export type RosterSyncJobTrigger = "admin" | "scheduled";

export type RosterSyncJobView = {
  id: string;
  status: RosterSyncJobStatus;
  trigger: RosterSyncJobTrigger;
  summary: SyncSummary | null;
  refusalReason: string | null;
  errorMessage: string | null;
};

type Toast = { tone: "error" | "success" | "warning"; text: string };

export function rosterSyncStatusLabel(job: Pick<RosterSyncJobView, "status" | "trigger">) {
  const prefix = job.trigger === "scheduled" ? "Automatic roster sync" : "Roster sync";
  switch (job.status) {
    case "queued": return `${prefix} queued`;
    case "running": return `${prefix} running`;
    case "succeeded": return `${prefix} completed`;
    case "refused": return `${prefix} refused`;
    case "failed": return `${prefix} failed`;
  }
}

export function isTerminalRosterSyncStatus(status: RosterSyncJobStatus) {
  return status === "succeeded" || status === "refused" || status === "failed";
}

export function rosterSyncResultToast(job: RosterSyncJobView): Toast | null {
  if (job.status === "succeeded" && job.summary) {
    const summary = job.summary;
    if (summary.usedFallbackCapture) {
      return { tone: "warning", text: `Roster synced from bundled capture (${summary.source}).` };
    }
    if (!summary.rosterComplete) {
      return {
        tone: "warning",
        text: `Partial roster synced from ${summary.source}.${incompleteDetail(summary.rosterCompleteness)} Missing residents were left unchanged.`,
      };
    }
    return { tone: "success", text: `Roster synced from live source (${summary.source}).` };
  }
  if (job.status === "refused") {
    const detail = job.refusalReason ? ` ${job.refusalReason}` : "";
    return { tone: "error", text: `Unable to sync at this time.${detail}` };
  }
  if (job.status === "failed") {
    const detail = job.errorMessage ? ` ${job.errorMessage}` : "";
    return { tone: "error", text: `Roster sync failed.${detail}` };
  }
  return null;
}

export const ROSTER_SYNC_POLL_INTERVAL_MS = 1_000;
export const ROSTER_SYNC_POLL_TIMEOUT_MS = 15 * 60 * 1_000;

export type RosterSyncPollOutcome =
  | { done: true; job: RosterSyncJobView }
  | { done: false; reason: "cancelled" | "timeout"; job: RosterSyncJobView };

type RosterSyncPollOptions = {
  fetchJob: (jobId: string) => Promise<RosterSyncJobView>;
  onUpdate?: (job: RosterSyncJobView) => void;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  timeoutMs?: number;
  cancelled?: () => boolean;
};

/**
 * Follow a job to a terminal state. A drain runner may be minutes away — or, if
 * no scheduler is running, may never arrive — so polling stops at a deadline and
 * whenever the caller says it has gone away, rather than looping forever.
 */
export async function pollRosterSyncJobUntilTerminal(
  initial: RosterSyncJobView,
  options: RosterSyncPollOptions,
): Promise<RosterSyncPollOutcome> {
  const {
    fetchJob,
    onUpdate,
    wait = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
    now = () => Date.now(),
    intervalMs = ROSTER_SYNC_POLL_INTERVAL_MS,
    timeoutMs = ROSTER_SYNC_POLL_TIMEOUT_MS,
    cancelled = () => false,
  } = options;

  const deadline = now() + timeoutMs;
  let current = initial;
  while (!isTerminalRosterSyncStatus(current.status)) {
    if (cancelled()) return { done: false, reason: "cancelled", job: current };
    if (now() >= deadline) return { done: false, reason: "timeout", job: current };
    await wait(intervalMs);
    if (cancelled()) return { done: false, reason: "cancelled", job: current };
    current = await fetchJob(current.id);
    onUpdate?.(current);
  }
  return { done: true, job: current };
}

function incompleteDetail(completeness: SyncSummary["rosterCompleteness"]) {
  const missing = Math.max(0, completeness.total - completeness.completed);
  if (missing > 0) {
    return ` About ${missing} of ${completeness.total} expected pages were not fetched.`;
  }
  if (completeness.timedOut) {
    return " The crawl timed out before confirming every page was fetched.";
  }
  return ` The crawl ended with status ${completeness.status}.`;
}
