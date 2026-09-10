import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import {
  AdminEmptyState,
  AdminEyebrow,
  AdminPage,
  AdminSurface,
} from "@/components/admin-ui";
import { PageViewTransition } from "@/components/page-view-transition";
import { prisma } from "@/lib/prisma";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";

import { CompanionPicker } from "./companion-picker";
import { VolunteerNav } from "./volunteer-ui";
import { UnfinishedCheckIns } from "./unfinished-check-ins";
import styles from "./volunteer.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer update | Dogathon",
  description:
    "Snap a photo and answer a few questions about a rescue companion.",
};

type VolunteerPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const volunteerQuerySchema = z.object({
  error: z.enum(["unavailable"]).optional().catch(undefined),
});

const MAX_CHECK_IN_RESIDENTS = 100;

export default async function VolunteerPage({
  params,
  searchParams,
}: VolunteerPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    roster: ["contribute"],
  });
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/volunteer`);
    redirect(
      access.authenticated
        ? "/staff/organizations"
        : `/staff/sign-in?next=${next}`,
    );
  }
  const { context } = access;

  const [{ error }, openCheckIns, residents] = await Promise.all([
    searchParams.then((query) => volunteerQuerySchema.parse(query)),
    prisma.checkIn.findMany({
      where: {
        orgId: context.orgId,
        userId: context.userId,
        status: "in_progress",
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        resident: { select: { name: true, breed: true, photoUrls: true } },
      },
      take: MAX_CHECK_IN_RESIDENTS,
    }),
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
          <VolunteerNav href="/staff/organizations" label="Your rescues" />
          <header className={styles.hero}>
            <div className={styles.heroCopy}>
              <AdminEyebrow tone="denim">Volunteer updates</AdminEyebrow>
              <h1>Who did you spend time with today?</h1>
              <p className={styles.heroLede}>
                Share a photo and a few details from your visit to help keep
                their sponsors up to date.
              </p>
            </div>
          </header>

          {error === "unavailable" ? (
            <p className={styles.chatError} role="alert">
              That companion is no longer available for updates.
            </p>
          ) : null}

          <UnfinishedCheckIns checkIns={openCheckIns} orgSlug={orgSlug} />

          {checkInResidents.length > 0 ? (
            <CompanionPicker companions={checkInResidents} orgSlug={orgSlug} />
          ) : (
            <AdminSurface className={styles.emptyPanel} tone="moss">
              <AdminEmptyState variant="volunteer">
                No companions have active sponsors right now, so there’s no one
                to share an update about yet.
              </AdminEmptyState>
            </AdminSurface>
          )}
        </div>
      </AdminPage>
    </PageViewTransition>
  );
}
