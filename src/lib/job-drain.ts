import { env as appEnv } from "./env.ts";
import { createEmailCompositionDrainer } from "./email-composition-worker.ts";
import {
  createRosterSyncDrainer,
  createVolunteerPhotoCleanupDrainer,
} from "./roster-sync-worker.ts";
import {
  isAuthorizedSchedulerRequest,
  type SchedulerEnvironment,
} from "./scheduler-auth.ts";

const DRAIN_REQUEST_BUDGET_MS = 4 * 60 * 1000;

type Dependencies = {
  drainComposition: ReturnType<typeof createEmailCompositionDrainer>;
  drainRoster: ReturnType<typeof createRosterSyncDrainer>;
  drainPhotoCleanup: ReturnType<typeof createVolunteerPhotoCleanupDrainer>;
  env: SchedulerEnvironment;
};

export function createJobDrainHandler(
  dependencies: Partial<Dependencies> = {},
) {
  const services: Dependencies = {
    drainComposition:
      dependencies.drainComposition ?? createEmailCompositionDrainer(),
    drainRoster: dependencies.drainRoster ?? createRosterSyncDrainer(),
    drainPhotoCleanup:
      dependencies.drainPhotoCleanup ?? createVolunteerPhotoCleanupDrainer(),
    env: dependencies.env ?? appEnv,
  };

  return async function drainJobs(request: Request) {
    if (!isAuthorizedSchedulerRequest(request, services.env))
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const startedAt = performance.now();
    try {
      // Give each potentially long-running queue a fixed share so one queue
      // cannot starve the other or exceed the scheduler request limit.
      const queueBudgetMs = Math.floor(DRAIN_REQUEST_BUDGET_MS / 2) - 5_000;
      const emailComposition = await services.drainComposition({
        budgetMs: queueBudgetMs,
      });
      const elapsed = performance.now() - startedAt;
      const rosterBudgetMs = Math.max(
        1,
        Math.min(queueBudgetMs, DRAIN_REQUEST_BUDGET_MS - elapsed - 5_000),
      );
      const rosterSync = await services.drainRoster({
        budgetMs: rosterBudgetMs,
      });
      const photoCleanup = await services.drainPhotoCleanup();
      return Response.json({
        drained:
          emailComposition.drained ||
          rosterSync.drained ||
          photoCleanup.drained,
        emailComposition,
        rosterSync,
        photoCleanup,
      });
    } catch (error) {
      console.error("Job drain failed", error);
      return Response.json({ error: "Job drain failed" }, { status: 500 });
    }
  };
}
