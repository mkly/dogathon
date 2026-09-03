import type { RosterSyncJobStatus, RosterSyncJobTrigger } from "@/generated/prisma/enums";

import type { SyncSummary } from "./roster-sync.ts";

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
