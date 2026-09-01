import { createRosterSyncDrainHandler } from "@/lib/roster-sync-drain";

export const maxDuration = 300;
const drainRosterSyncJob = createRosterSyncDrainHandler();

export const GET = drainRosterSyncJob;
export const POST = drainRosterSyncJob;
