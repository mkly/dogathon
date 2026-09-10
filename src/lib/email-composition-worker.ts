import {
  completeEmailComposition,
  failEmailComposition,
  fetchEmailComposition,
  rejectEmailComposition,
  type ClaimedEmailCompositionJob,
} from "./email-composition-queue.ts";
import type { EmailCompositionJobView } from "./email-composition-client.ts";
import { composeGraduationDraft } from "./graduation-draft-composer.ts";
import { composeRegularDraft } from "./regular-draft-composer.ts";

export const DEFAULT_EMAIL_COMPOSITION_BUDGET_MS = 3 * 60 * 1000;

type Dependencies = {
  fetch: () => Promise<ClaimedEmailCompositionJob | null>;
  composeRegular: typeof composeRegularDraft;
  composeGraduation: typeof composeGraduationDraft;
  complete: (
    jobId: string,
    draftId: string,
  ) => Promise<EmailCompositionJobView>;
  fail: (jobId: string, error: string) => Promise<EmailCompositionJobView>;
  reject: (jobId: string, error: string) => Promise<EmailCompositionJobView>;
};

const defaults: Dependencies = {
  fetch: fetchEmailComposition,
  composeRegular: composeRegularDraft,
  composeGraduation: composeGraduationDraft,
  complete: completeEmailComposition,
  fail: failEmailComposition,
  reject: rejectEmailComposition,
};

export function createEmailCompositionDrainer(
  dependencies: Dependencies = defaults,
) {
  return async function drain(options: { budgetMs?: number } = {}) {
    const budgetMs = options.budgetMs ?? DEFAULT_EMAIL_COMPOSITION_BUDGET_MS;
    if (!Number.isFinite(budgetMs) || budgetMs <= 0)
      throw new RangeError("budgetMs must be positive");
    const job = await dependencies.fetch();
    if (!job) return { drained: false as const };

    const budgetSignal = AbortSignal.timeout(budgetMs);
    const signal = job.signal
      ? AbortSignal.any([job.signal, budgetSignal])
      : budgetSignal;
    try {
      signal.throwIfAborted();
      const result =
        job.data.kind === "regular"
          ? await dependencies.composeRegular(
              job.data.draftId,
              job.data.targetId,
              job.data.orgId,
              signal,
            )
          : await dependencies.composeGraduation(
              job.data.targetId,
              job.data.orgId,
              signal,
            );
      signal.throwIfAborted();
      if (result !== "composed") {
        return {
          drained: true as const,
          job: await dependencies.reject(job.id, failureMessage(result)),
        };
      }
      return {
        drained: true as const,
        job: await dependencies.complete(job.id, job.data.draftId),
      };
    } catch (error) {
      const message = budgetSignal.aborted
        ? `Email composition exceeded its ${budgetMs}ms drain budget`
        : error instanceof Error
          ? error.message
          : "Email composition failed";
      return {
        drained: true as const,
        job: await dependencies.fail(job.id, message),
      };
    }
  };
}

function failureMessage(result: string) {
  switch (result) {
    case "not-found":
      return "The draft or companion no longer exists.";
    case "not-available":
      return "Regular updates require an available companion.";
    case "not-adopted":
      return "Only adoption notices can compose a graduation story.";
    case "no-pending-chats":
      return "There are no pending chats to compose.";
    case "conflict":
      return "Those chats were already used in another update.";
    default:
      return "Email composition failed.";
  }
}
