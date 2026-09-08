import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AdminEmptyState, AdminPage } from "@/components/admin-ui";
import { FeltLink, FeltPanel, StitchBadge } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { prisma } from "@/lib/prisma";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { uuidSchema } from "@/lib/uuid";

import { finishCheckIn } from "./actions";
import { CheckInChat } from "./check-in-chat";
import styles from "./volunteer.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer check-in | Dogathon",
  description: "Share a quick photo or care note for a rescue companion.",
};

type VolunteerPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const volunteerQuerySchema = z.object({
  companion: uuidSchema.optional().catch(undefined),
  submitted: z.literal("1").optional().catch(undefined),
  error: z.enum(["invalid", "rate-limited", "save", "summary", "unavailable"]).optional().catch(undefined),
});

const MAX_CHECK_IN_RESIDENTS = 100;

export default async function VolunteerPage({ params, searchParams }: VolunteerPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    roster: ["contribute"],
  });
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/volunteer`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  const [{ companion, error, submitted }, residents] = await Promise.all([
    searchParams.then((query) => volunteerQuerySchema.parse(query)),
    prisma.resident.findMany({
      where: {
        orgId: context.orgId,
        available: true,
        sponsorships: { some: { orgId: context.orgId, status: "active" } },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrls: true },
      take: MAX_CHECK_IN_RESIDENTS,
    }),
  ]);

  const checkInResidents = residents.map(({ id, name, photoUrls }) => ({
    id,
    name,
    photoUrl: photoUrls[0],
  }));

  const submittedCompanion = residents.find((resident) => resident.id === companion);

  if (submitted === "1") {
    return (
      <PageViewTransition>
        <AdminPage variant="volunteer">
          <FeltPanel className={styles.confirmation} tone="moss">
            <StitchBadge tone="cream">Note tucked in</StitchBadge>
            <div aria-hidden="true" className={styles.confirmationMark}>✓</div>
            <h1>Thanks for checking in!</h1>
            <p>
              {submittedCompanion
                ? `${submittedCompanion.name}’s care team can see your note now.`
                : "The care team can see your note now."}
            </p>
            <FeltLink className={styles.againLink} href={`/${orgSlug}/volunteer`}>
              Submit another
            </FeltLink>
          </FeltPanel>
        </AdminPage>
      </PageViewTransition>
    );
  }

  return (
    <PageViewTransition>
      <AdminPage className={styles.chatPage} variant="volunteer">
        <section className={styles.shell}>
          <header className={styles.chatHeader}>
            <StitchBadge tone="denim">Volunteer check-in</StitchBadge>
            <h1>How’s a companion doing?</h1>
            <p>Share the moments their care team and sponsor should know.</p>
          </header>
          {error === "rate-limited" ? <p className={styles.chatError} role="alert">Please wait a little before trying again.</p> : null}
          {error === "invalid" ? <p className={styles.chatError} role="alert">The check-in details were invalid. Please try again.</p> : null}
          {error === "unavailable" ? <p className={styles.chatError} role="alert">That companion is no longer available for check-ins.</p> : null}
          {error === "summary" ? <p className={styles.chatError} role="alert">We could not write the care note from that conversation. Please try again.</p> : null}
          {error === "save" ? <p className={styles.chatError} role="alert">The care note was written but could not be saved. Please try again.</p> : null}

          {checkInResidents.length > 0 ? (
            <CheckInChat
              onFinish={finishCheckIn.bind(null, orgSlug)}
              orgSlug={orgSlug}
              residents={checkInResidents}
            />
          ) : (
            <FeltPanel className={styles.emptyPanel} tone="oatmeal">
              <AdminEmptyState variant="volunteer">
                No companions have active sponsors right now, so there’s no one to check in for yet.
              </AdminEmptyState>
            </FeltPanel>
          )}
        </section>
      </AdminPage>
    </PageViewTransition>
  );
}
