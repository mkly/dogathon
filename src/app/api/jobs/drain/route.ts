import { createJobDrainHandler } from "@/lib/job-drain";

export const maxDuration = 300;
const drainJobs = createJobDrainHandler();

export const GET = drainJobs;
export const POST = drainJobs;
