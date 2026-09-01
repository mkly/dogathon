import type { RosterSyncJobStatus } from "@/generated/prisma/enums";

import type { SyncSummary } from "./roster-sync.ts";

export type RosterSyncJobView = {
  id: string;
  status: RosterSyncJobStatus;
  summary: SyncSummary | null;
  refusalReason: string | null;
  errorMessage: string | null;
};

type Toast = { tone: "error" | "success" | "warning"; text: string };

export function rosterSyncStatusLabel(status: RosterSyncJobStatus) {
  switch (status) {
    case "queued": return "Roster sync queued";
    case "running": return "Roster sync running";
    case "succeeded": return "Roster sync completed";
    case "refused": return "Roster sync refused";
    case "failed": return "Roster sync failed";
  }
}

export function isTerminalRosterSyncStatus(status: RosterSyncJobStatus) {
  return status === "succeeded" || status === "refused" || status === "failed";
}

export function rosterSyncResultToast(job: RosterSyncJobView): Toast | null {
  if (job.status === "succeeded" && job.summary) {
    return job.summary.usedFallbackCapture
      ? {
          tone: "warning",
          text: `Roster synced from bundled capture (${job.summary.source}).`,
        }
      : {
          tone: "success",
          text: `Roster synced from live source (${job.summary.source}).`,
        };
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
