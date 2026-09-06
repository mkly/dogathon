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
import { formatDate } from "@/lib/format";
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

export default async function SponsorDetailPage({ params }: SponsorDetailPageProps) {
  const { sponsorId, orgSlug } = await params;
  if (!uuidSchema.safeParse(sponsorId).success) notFound();
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    sponsors: ["read"],
  });

  if (!access) notFound();
  if (!access.context) redirect("/staff/organizations");
  const { context } = access;

  const sponsor = await prisma.sponsor.findFirst({
    where: { id: sponsorId, sponsorships: { some: { orgId: context.orgId } } },
    include: {
      sponsorships: {
        where: { orgId: context.orgId },
        include: { resident: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
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
            <AdminBadge tone="mustard">{sponsor.sponsorships.length} {pluralize("companion", sponsor.sponsorships.length)}</AdminBadge>
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
                    <td><AdminStatus>{sponsorship.status}</AdminStatus></td>
                    <td>{formatDate(sponsorship.createdAt)}</td>
                    <td>{sponsorship.status === "ended" ? formatDate(sponsorship.updatedAt) : "Ongoing"}</td>
                    <td className={styles.reason}>{sponsorship.endedReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          </AdminSurface>
        </section>
      </AdminPage>
    </PageViewTransition>
  );
}
