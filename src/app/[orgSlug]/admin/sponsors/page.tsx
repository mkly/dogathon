import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import pluralize from "pluralize";

import {
  AdminBadge,
  AdminEmptyState,
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

import styles from "./sponsors.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sponsors | Dogathon staff",
  description: "Private sponsor directory for Dogathon staff.",
};

type SponsorsPageProps = { params: Promise<{ orgSlug: string }> };

export default async function SponsorsPage({ params }: SponsorsPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    sponsors: ["read"],
  });

  if (!access) notFound();
  if (!access.context) redirect("/staff/organizations");
  const { context } = access;

  const sponsors = await prisma.sponsor.findMany({
    where: { sponsorships: { some: { orgId: context.orgId } } },
    include: {
      sponsorships: {
        where: { orgId: context.orgId },
        include: { resident: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { email: "asc" },
  });
  const sponsorshipCount = sponsors.reduce(
    (total, sponsor) => total + sponsor.sponsorships.length,
    0,
  );

  return (
    <PageViewTransition>
      <AdminPage variant="directory">
        <AdminHeader
          actions={<AdminLink className={styles.backLink} href={`/${orgSlug}/admin`} transitionTypes={["nav-back"]}>
            Back to staff room
          </AdminLink>}
          eyebrow="Private staff directory"
          lede="Contact preferences and every companion supported by each sponsor."
          title="Sponsors"
          variant="directory"
        />

        <div className={styles.summary}>
          <p>{sponsors.length} {pluralize("person", sponsors.length)} · {sponsorshipCount} {pluralize("sponsorship", sponsorshipCount)}</p>
          <AdminBadge tone="moss">staff only</AdminBadge>
        </div>

        {sponsors.length === 0 ? (
          <AdminSurface tone="oatmeal">
            <AdminEmptyState>
              <span aria-hidden="true">🧵</span>
              <h2>No sponsors yet</h2>
              <p>New sponsorships will be tucked into this directory.</p>
            </AdminEmptyState>
          </AdminSurface>
        ) : (
          <section aria-label="Sponsor directory" className={styles.sponsorList}>
            {sponsors.map((sponsor) => (
              <AdminSurface className={styles.sponsorCard} key={sponsor.id} tone="oatmeal">
                <div className={styles.sponsorHeading}>
                  <div>
                    <h2>{sponsor.name}</h2>
                    <AdminBadge tone={sponsor.sponsorships.some(({ status }) => status === "active") ? "moss" : "brick"}>
                      {sponsor.sponsorships.length} {pluralize("companion", sponsor.sponsorships.length)}
                    </AdminBadge>
                  </div>
                  <div className={styles.contact}>
                    <p><a href={`mailto:${sponsor.email}`}>{sponsor.email}</a></p>
                    <p>{sponsor.phone ? <a href={`tel:${sponsor.phone}`}>{sponsor.phone}</a> : "No phone provided"}</p>
                    <p>Updates: {sponsor.channel}</p>
                    <AdminLink href={`/${orgSlug}/admin/sponsors/${sponsor.id}`} tone="mustard">
                      View sponsor
                    </AdminLink>
                  </div>
                </div>

                <AdminTable>
                  <thead>
                    <tr>
                      <th scope="col">Sponsored companion</th>
                      <th scope="col">Status</th>
                      <th scope="col">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sponsor.sponsorships.map((record) => (
                      <tr key={record.id}>
                        <td>{record.resident.name}</td>
                        <td><AdminStatus>{record.status}</AdminStatus></td>
                        <td>{formatDate(record.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              </AdminSurface>
            ))}
          </section>
        )}
      </AdminPage>
    </PageViewTransition>
  );
}
