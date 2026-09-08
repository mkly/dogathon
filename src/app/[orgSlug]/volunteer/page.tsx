import clsx from "clsx";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AdminEmptyState, AdminPage } from "@/components/admin-ui";
import { FeltPanel, PhotoPatch, Stitch, StitchBadge } from "@/components/felt";
import felt from "@/components/felt.module.css";
import { PageViewTransition } from "@/components/page-view-transition";
import { prisma } from "@/lib/prisma";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";

import { startCheckIn } from "./actions";
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
  error: z.enum(["unavailable"]).optional().catch(undefined),
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

  const [{ error }, residents] = await Promise.all([
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

  return (
    <PageViewTransition>
      <AdminPage className={styles.chatPage} variant="volunteer">
        <section className={styles.shell}>
          <header className={styles.chatHeader}>
            <StitchBadge tone="denim">Volunteer check-in</StitchBadge>
            <h1>How’s a companion doing?</h1>
            <p>Share the moments their care team and sponsor should know.</p>
          </header>
          {error === "unavailable" ? <p className={styles.chatError} role="alert">That companion is no longer available for check-ins.</p> : null}

          {checkInResidents.length > 0 ? (
            <div aria-label="Choose a companion" className={styles.companionPicker}>
              {checkInResidents.map((resident) => (
                <form action={startCheckIn.bind(null, orgSlug, resident.id)} key={resident.id}>
                  <button className={clsx(felt["felt-button"], "felt-cream", styles.companionChip)} type="submit">
                    <Stitch fine />
                    <PhotoPatch alt="" className={styles.chipPhoto} sizes="40px" src={resident.photoUrl} />
                    <span>{resident.name}</span>
                  </button>
                </form>
              ))}
            </div>
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
