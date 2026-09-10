import { randomUUID } from "node:crypto";
import type { Job, JobWithMetadata, PgBoss } from "pg-boss";

import type { EmailCompositionJobView } from "./email-composition-client.ts";
import { getJobBoss } from "./roster-sync-queue.ts";

export const EMAIL_COMPOSITION_QUEUE = "email-composition";
export const EMAIL_COMPOSITION_RETRY_LIMIT = 3;
export const EMAIL_COMPOSITION_EXPIRE_SECONDS = 4 * 60;

export type EmailCompositionJobData = {
  orgId: string;
  requestedByUserId: string;
  kind: "regular" | "graduation";
  targetId: string;
  draftId: string;
};

type EmailCompositionOutput = {
  draftId?: string;
  errorMessage?: string;
};

export type ClaimedEmailCompositionJob = Omit<
  Job<EmailCompositionJobData>,
  "signal"
> & { signal?: AbortSignal };

type CompositionBoss = Pick<
  PgBoss,
  "send" | "fetch" | "complete" | "fail" | "getJobById" | "findJobs"
>;

export class EmailCompositionJobNotFoundError extends Error {}

export function createEmailCompositionQueue(boss: CompositionBoss) {
  async function enqueue(input: {
    orgId: string;
    requestedByUserId: string;
    kind: "regular" | "graduation";
    targetId: string;
  }): Promise<EmailCompositionJobView> {
    const data: EmailCompositionJobData = {
      ...input,
      draftId: input.kind === "graduation" ? input.targetId : randomUUID(),
    };
    const singletonKey = `${input.kind}:${input.orgId}:${input.targetId}`;
    const id = await boss.send(EMAIL_COMPOSITION_QUEUE, data, {
      singletonKey,
      retryLimit: EMAIL_COMPOSITION_RETRY_LIMIT,
      expireInSeconds: EMAIL_COMPOSITION_EXPIRE_SECONDS,
    });
    if (id) return publicEmailCompositionJob(await requireJob(boss, id));

    const existing = (
      await boss.findJobs<EmailCompositionJobData>(EMAIL_COMPOSITION_QUEUE, {
        key: singletonKey,
      })
    ).toSorted(
      (left, right) => right.createdOn.getTime() - left.createdOn.getTime(),
    )[0];
    if (!existing)
      throw new Error(`Composition singleton ${singletonKey} disappeared`);
    return publicEmailCompositionJob(existing);
  }

  async function get(orgId: string, jobId: string) {
    const job = await boss.getJobById<EmailCompositionJobData>(
      EMAIL_COMPOSITION_QUEUE,
      jobId,
    );
    if (!job || job.data.orgId !== orgId)
      throw new EmailCompositionJobNotFoundError();
    return publicEmailCompositionJob(job);
  }

  async function fetch() {
    return (
      (await boss.fetch<EmailCompositionJobData>(EMAIL_COMPOSITION_QUEUE))[0] ??
      null
    );
  }

  async function complete(jobId: string, draftId: string) {
    await boss.complete(EMAIL_COMPOSITION_QUEUE, jobId, { draftId });
    return publicEmailCompositionJob(await requireJob(boss, jobId));
  }

  async function fail(jobId: string, errorMessage: string) {
    await boss.fail(EMAIL_COMPOSITION_QUEUE, jobId, { errorMessage });
    return publicEmailCompositionJob(await requireJob(boss, jobId));
  }

  async function reject(jobId: string, errorMessage: string) {
    await boss.complete(EMAIL_COMPOSITION_QUEUE, jobId, { errorMessage });
    return publicEmailCompositionJob(await requireJob(boss, jobId));
  }

  return { enqueue, get, fetch, complete, fail, reject };
}

function publicEmailCompositionJob(
  job: JobWithMetadata<EmailCompositionJobData>,
): EmailCompositionJobView {
  const output = (job.output ?? {}) as EmailCompositionOutput;
  return {
    id: job.id,
    kind: job.data.kind,
    targetId: job.data.targetId,
    status:
      job.state === "completed"
        ? output.errorMessage
          ? "failed"
          : "completed"
        : job.state === "failed" || job.state === "cancelled"
          ? "failed"
          : job.state === "active"
            ? "composing"
            : "queued",
    draftId: output.draftId ?? null,
    errorMessage: output.errorMessage ?? null,
  };
}

async function requireJob(boss: CompositionBoss, jobId: string) {
  const job = await boss.getJobById<EmailCompositionJobData>(
    EMAIL_COMPOSITION_QUEUE,
    jobId,
  );
  if (!job) throw new EmailCompositionJobNotFoundError();
  return job;
}

async function defaultQueue() {
  const boss = await getJobBoss();
  await boss.createQueue(EMAIL_COMPOSITION_QUEUE, {
    policy: "exclusive",
    retryLimit: EMAIL_COMPOSITION_RETRY_LIMIT,
    expireInSeconds: EMAIL_COMPOSITION_EXPIRE_SECONDS,
  });
  return createEmailCompositionQueue(boss);
}

export async function enqueueEmailComposition(
  input: Parameters<
    ReturnType<typeof createEmailCompositionQueue>["enqueue"]
  >[0],
) {
  return (await defaultQueue()).enqueue(input);
}

export async function getEmailComposition(orgId: string, jobId: string) {
  return (await defaultQueue()).get(orgId, jobId);
}

export async function fetchEmailComposition() {
  return (await defaultQueue()).fetch();
}

export async function completeEmailComposition(jobId: string, draftId: string) {
  return (await defaultQueue()).complete(jobId, draftId);
}

export async function failEmailComposition(jobId: string, message: string) {
  return (await defaultQueue()).fail(jobId, message);
}

export async function rejectEmailComposition(jobId: string, message: string) {
  return (await defaultQueue()).reject(jobId, message);
}
