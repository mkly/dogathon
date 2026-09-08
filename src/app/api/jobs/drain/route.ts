import {
  createRosterSyncDrainHandler,
  createSponsorshipGracePeriodDrainer,
  createVolunteerPhotoCleanupDrainer,
} from "@/lib/roster-sync-worker";

export const maxDuration = 300;
const drainRosterSyncJob = createRosterSyncDrainHandler();
const drainVolunteerPhotoCleanup = createVolunteerPhotoCleanupDrainer();
const drainSponsorshipGracePeriod = createSponsorshipGracePeriodDrainer();

async function drainJobs(request: Request) {
  const response = await drainRosterSyncJob(request);
  if (response.ok) {
    await drainSponsorshipGracePeriod();
    await drainVolunteerPhotoCleanup();
  }
  return response;
}

export const GET = drainJobs;
export const POST = drainJobs;
