import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AdminPage } from "@/components/admin-ui";
import { FeltLink, FeltPanel, StitchBadge } from "@/components/felt";
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
  title: "Volunteer check-in | Dogathon",
  description: "Continue a saved volunteer check-in.",
};

type CheckInPageProps = {
  params: Promise<{ checkInId: string; orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorSchema = z.object({
  error: z.enum(["invalid", "rate-limited", "save", "summary"]).optional().catch(undefined),
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
      note: { select: { note: true } },
      photos: {
        orderBy: { createdAt: "asc" },
        select: { id: true, url: true },
      },
      resident: { select: { id: true, name: true } },
      status: true,
      transcript: true,
    },
  });
  if (!checkIn) notFound();

  if (checkIn.status === "completed") {
    return (
      <PageViewTransition>
        <AdminPage variant="volunteer">
          <FeltPanel className={styles.confirmation} tone="moss">
            <StitchBadge tone="cream">Note tucked in</StitchBadge>
            <div aria-hidden="true" className={styles.confirmationMark}>✓</div>
            <h1>Thanks for checking in!</h1>
            <p>{checkIn.resident.name}’s care team can see your note now.</p>
            {checkIn.note ? <blockquote className={styles.savedNote}>{checkIn.note.note}</blockquote> : null}
            <FeltLink className={styles.againLink} href={`/${orgSlug}/volunteer`}>
              Submit another
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
        <section className={styles.shell}>
          <header className={styles.chatHeader}>
            <StitchBadge tone="denim">Volunteer check-in</StitchBadge>
            <h1>How’s {checkIn.resident.name} doing?</h1>
            <p>This conversation is saved as you go.</p>
          </header>
          {error === "rate-limited" ? <p className={styles.chatError} role="alert">Please wait a little before trying again.</p> : null}
          {error === "invalid" ? <p className={styles.chatError} role="alert">The saved conversation is not ready to finish.</p> : null}
          {error === "summary" ? <p className={styles.chatError} role="alert">We could not write the care note from that conversation. Please try again.</p> : null}
          {error === "save" ? <p className={styles.chatError} role="alert">The care note was written but could not be saved. Please try again.</p> : null}
          <CheckInChat
            checkInId={checkInId}
            initialPhotos={checkIn.photos}
            initialMessages={textOnlyTranscript(transcript.data)}
            onFinish={finishCheckIn.bind(null, orgSlug)}
            orgSlug={orgSlug}
            resident={checkIn.resident}
          />
        </section>
      </AdminPage>
    </PageViewTransition>
  );
}
