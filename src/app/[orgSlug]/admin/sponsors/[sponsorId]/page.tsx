import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import pluralize from "pluralize";

import {
  AdminBadge,
  AdminHeader,
  AdminLink,
  AdminPage,
  AdminStatus,
  AdminSurface,
  AdminTable,
} from "@/components/admin-ui";
import { formatDate, sponsorshipEndedReasonLabel, sponsorshipStatusLabel } from "@/lib/format";
import { PageViewTransition } from "@/components/page-view-transition";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

import styles from "../sponsors.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sponsor details | Dogathon staff",
  description: "Private sponsorship history for Dogathon staff.",
};

type SponsorDetailPageProps = {
  params: Promise<{ sponsorId: string; orgSlug: string }>;
};

const SPONSORSHIP_HISTORY_LIMIT = 100;

export default async function SponsorDetailPage({ params }: SponsorDetailPageProps) {
  const { sponsorId, orgSlug } = await params;
  if (!uuidSchema.safeParse(sponsorId).success) notFound();
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    sponsors: ["read"],
  });

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/sponsors/${sponsorId}`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  const sponsor = await prisma.sponsor.findFirst({
    where: { id: sponsorId, sponsorships: { some: { orgId: context.orgId } } },
    select: {
      email: true,
      name: true,
      _count: { select: { sponsorships: { where: { orgId: context.orgId } } } },
      sponsorships: {
        where: { orgId: context.orgId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          endedAt: true,
          endedReason: true,
          resident: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
        take: SPONSORSHIP_HISTORY_LIMIT,
      },
    },
  });

  if (!sponsor) notFound();

  return (
    <PageViewTransition>
      <AdminPage variant="directory">
        <AdminHeader
          actions={<AdminLink className={styles.backLink} href={`/${orgSlug}/admin/sponsors`} transitionTypes={["nav-back"]}>
            Back to sponsors
          </AdminLink>}
          eyebrow="Sponsor record"
          lede="Full contact details and sponsorship history."
          title={sponsor.name}
          variant="directory"
        />

        <AdminSurface className={styles.profile} tone="denim">
          <div className={styles.profileItem}>
            <small>Email</small>
            <a href={`mailto:${sponsor.email}`}>{sponsor.email}</a>
          </div>
        </AdminSurface>

        <section aria-labelledby="history-heading">
          <div className={styles.historyTitle}>
            <h2 id="history-heading">Sponsorship history</h2>
            <AdminBadge tone="mustard">{sponsor._count.sponsorships} {pluralize("companion", sponsor._count.sponsorships)}</AdminBadge>
          </div>
          <AdminSurface className={styles.historyPanel} tone="oatmeal">
            <AdminTable>
              <thead>
                <tr>
                  <th scope="col">Companion</th>
                  <th scope="col">Status</th>
                  <th scope="col">Started</th>
                  <th scope="col">Ended</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {sponsor.sponsorships.map((sponsorship) => (
                  <tr key={sponsorship.id}>
                    <td>{sponsorship.resident.name}</td>
                    <td><AdminStatus>{sponsorshipStatusLabel(sponsorship.status)}</AdminStatus></td>
                    <td>{formatDate(sponsorship.createdAt)}</td>
                    <td>{sponsorship.endedAt ? formatDate(sponsorship.endedAt) : "—"}</td>
                    <td className={styles.reason}>{sponsorshipEndedReasonLabel(sponsorship.endedReason)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </AdminSurface>
          {sponsor._count.sponsorships > SPONSORSHIP_HISTORY_LIMIT ? (
            <p className={styles.limitNotice}>
              Showing the first {SPONSORSHIP_HISTORY_LIMIT} sponsorships in this history.
            </p>
          ) : null}
        </section>
      </AdminPage>
    </PageViewTransition>
  );
}
