import clsx from "clsx";
import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { AdminEmptyState, AdminPage } from "@/components/admin-ui";
import { FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import felt from "@/components/felt.module.css";
import { PageViewTransition } from "@/components/page-view-transition";
import { prisma } from "@/lib/prisma";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";

import feltPup from "../../../../public/mascot/felt-pup-2.png";
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
      select: { id: true, name: true, breed: true, photoUrls: true },
      take: MAX_CHECK_IN_RESIDENTS,
    }),
  ]);

  const checkInResidents = residents.map(({ id, name, breed, photoUrls }) => ({
    id,
    name,
    breed,
    photoUrl: photoUrls[0],
  }));

  return (
    <PageViewTransition>
      <AdminPage className={styles.pickerPage} variant="volunteer">
        <div className={styles.pickerShell}>
          <FeltPanel className={styles.hero} tone="moss">
            <div className={styles.heroCopy}>
              <StitchBadge tone="cream">Volunteer check-in</StitchBadge>
              <h1>Who did you spend time with today?</h1>
              <p className={styles.heroLede}>
                Snap a photo and answer a few questions. It becomes a note for the care team
                and the next update to their sponsors.
              </p>
            </div>
            <Image alt="" className={styles.heroMascot} preload src={feltPup} />
          </FeltPanel>

          {error === "unavailable" ? (
            <p className={styles.chatError} role="alert">That companion is no longer available for check-ins.</p>
          ) : null}

          {checkInResidents.length > 0 ? (
            <div aria-label="Choose a companion" className={styles.companionPicker}>
              {checkInResidents.map((resident) => (
                <form action={startCheckIn.bind(null, orgSlug, resident.id)} key={resident.id}>
                  <button className={clsx(felt["felt-button"], "felt-oatmeal", styles.companionCard)} type="submit">
                    <PhotoPatch alt="" className={styles.cardPhoto} sizes="(min-width: 42rem) 14rem, 45vw" src={resident.photoUrl} />
                    <span className={styles.cardCopy}>
                      <span className={styles.cardName}>{resident.name}</span>
                      <span className={styles.cardBreed}>{resident.breed}</span>
                      <span className={styles.cardAction}>Check in →</span>
                    </span>
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
        </div>
      </AdminPage>
    </PageViewTransition>
  );
}
