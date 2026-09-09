import {
  createRosterSyncDrainHandler,
  createVolunteerPhotoCleanupDrainer,
} from "@/lib/roster-sync-worker";

export const maxDuration = 300;
const drainRosterSyncJob = createRosterSyncDrainHandler();
const drainVolunteerPhotoCleanup = createVolunteerPhotoCleanupDrainer();

async function drainJobs(request: Request) {
  const response = await drainRosterSyncJob(request);
  if (response.ok) {
    await drainVolunteerPhotoCleanup();
  }
  return response;
}

export const GET = drainJobs;
export const POST = drainJobs;
