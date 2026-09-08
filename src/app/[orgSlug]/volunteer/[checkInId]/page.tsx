import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import clsx from "clsx";

import { AdminPage } from "@/components/admin-ui";
import { FeltLink, FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import felt from "@/components/felt.module.css";
import { PageViewTransition } from "@/components/page-view-transition";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { interviewTranscriptSchema, textOnlyTranscript } from "@/lib/volunteer-interview-request";
import { uuidSchema } from "@/lib/uuid";

import { finishCheckIn } from "../actions";
import { CheckInChat } from "../check-in-chat";
import styles from "../volunteer.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer update | Dogathon",
  description: "Continue a saved volunteer update.",
};

type CheckInPageProps = {
  params: Promise<{ checkInId: string; orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorSchema = z.object({
  error: z.enum(["invalid", "rate-limited"]).optional().catch(undefined),
});

export default async function CheckInPage({ params, searchParams }: CheckInPageProps) {
  const { checkInId, orgSlug } = await params;
  if (!uuidSchema.safeParse(checkInId).success) notFound();
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    roster: ["contribute"],
  });
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/volunteer/${checkInId}`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }

  const checkIn = await prisma.checkIn.findFirst({
    where: { id: checkInId, orgId: access.context.orgId, userId: access.context.userId },
    select: {
      photos: {
        orderBy: { createdAt: "asc" },
        select: { id: true, url: true },
      },
      resident: { select: { id: true, name: true, photoUrls: true } },
      status: true,
      transcript: true,
    },
  });
  if (!checkIn) notFound();

  const { id: residentId, name: residentName, photoUrls } = checkIn.resident;
  const resident = { id: residentId, name: residentName };
  const residentPhoto = photoUrls[0];

  if (checkIn.status === "completed") {
    return (
      <PageViewTransition>
        <AdminPage className={styles.chatPage} variant="volunteer">
          <FeltPanel className={styles.confirmation} tone="moss">
            <PhotoPatch alt="" className={styles.confirmationPhoto} sizes="9rem" src={residentPhoto} />
            <StitchBadge tone="cream">Note tucked in</StitchBadge>
            <h1>Thanks for the update on {residentName}!</h1>
            <p>It goes into the next update for {residentName}’s sponsors.</p>
            <FeltLink className={styles.againLink} href={`/${orgSlug}/volunteer`}>
              Share another update
            </FeltLink>
          </FeltPanel>
        </AdminPage>
      </PageViewTransition>
    );
  }

  const transcript = interviewTranscriptSchema.safeParse(checkIn.transcript);
  if (!transcript.success) notFound();
  const { error } = errorSchema.parse(await searchParams);

  return (
    <PageViewTransition>
      <AdminPage className={styles.chatPage} variant="volunteer">
        <section className={clsx(felt["felt-panel"], "felt-cream", styles.shell)}>
          <header className={styles.chatHeader}>
            <PhotoPatch alt="" className={styles.headerPhoto} sizes="4rem" src={residentPhoto} />
            <div className={styles.headerCopy}>
              <StitchBadge tone="denim">Volunteer update</StitchBadge>
              <h1>How’s {residentName} doing?</h1>
            </div>
          </header>
          {error === "rate-limited" ? <p className={styles.chatError} role="alert">Please wait a little before trying again.</p> : null}
          {error === "invalid" ? <p className={styles.chatError} role="alert">The saved conversation is not ready to finish.</p> : null}
          <CheckInChat
            checkInId={checkInId}
            initialPhotos={checkIn.photos}
            initialMessages={textOnlyTranscript(transcript.data)}
            onFinish={finishCheckIn.bind(null, orgSlug)}
            orgSlug={orgSlug}
            resident={resident}
          />
        </section>
      </AdminPage>
    </PageViewTransition>
  );
}
