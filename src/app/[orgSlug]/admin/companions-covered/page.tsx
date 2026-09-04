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
  AdminSurface,
  AdminTable,
} from "@/components/admin-ui";
import { PhotoPatch } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { formatDate } from "@/lib/format";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import styles from "./companions-covered.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Companions covered | Dogathon staff",
  description: "Private sponsorship directory grouped by companion for Dogathon staff.",
};

type CompanionsCoveredPageProps = { params: Promise<{ orgSlug: string }> };

export default async function CompanionsCoveredPage({ params }: CompanionsCoveredPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    sponsors: ["read"],
  });

  if (!access) notFound();
  if (!access.context) redirect("/staff/organizations");
  const { context } = access;

  const residents = await prisma.resident.findMany({
    where: { orgId: context.orgId, sponsorships: { some: { orgId: context.orgId } } },
    include: {
      sponsorships: {
        where: { orgId: context.orgId },
        include: { sponsor: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const sponsorshipCount = residents.reduce(
    (total, resident) => total + resident.sponsorships.length,
    0,
  );
  // The /admin stat card counts only companions with a live sponsor, so spell out that
  // slice here too: this page also keeps companions whose sponsorships have all ended.
  const activelyCoveredCount = residents.filter((resident) =>
    resident.sponsorships.some(({ status }) => status === "active"),
  ).length;

  return (
    <PageViewTransition>
      <AdminPage variant="directory">
      <AdminHeader
        actions={<AdminLink className={styles.backLink} href={`/${orgSlug}/admin`} transitionTypes={["nav-back"]}>
          Back to staff room
        </AdminLink>}
        eyebrow="Private staff directory"
        lede="Every sponsored resident and the people supporting them."
        title="Companions covered"
        variant="directory"
      />

      <div className={styles.summary}>
        <p>
          {residents.length} {pluralize("companion", residents.length)} · {sponsorshipCount}{" "}
          {pluralize("sponsorship", sponsorshipCount)} · {activelyCoveredCount}{" "}
          actively covered
        </p>
        <AdminBadge tone="moss">staff only</AdminBadge>
      </div>

      {residents.length === 0 ? (
        <AdminSurface tone="oatmeal">
          <AdminEmptyState>
            <span aria-hidden="true">🐾</span>
            <h2>No companions covered yet</h2>
            <p>Residents will appear here when their first sponsorship begins.</p>
          </AdminEmptyState>
        </AdminSurface>
      ) : (
        <section aria-label="Companions covered directory" className={styles.companionList}>
          {residents.map((resident) => {
            const hasActiveSponsor = resident.sponsorships.some(
              ({ status }) => status === "active",
            );

            return (
              <AdminSurface className={styles.companionCard} key={resident.id} tone="oatmeal">
                <div className={styles.companionHeading}>
                  <PhotoPatch
                    alt={`${resident.name} portrait`}
                    className={styles.photo}
                    src={resident.photoUrls[0]}
                  />
                  <div className={styles.companionDetails}>
                    <h2>{resident.name}</h2>
                    <p>{resident.breed}</p>
                    <div className={styles.badges}>
                      <AdminBadge tone={resident.status === "available" ? "denim" : "brick"}>
                        {resident.status}
                      </AdminBadge>
                      <AdminBadge tone={hasActiveSponsor ? "moss" : "brick"}>
                        {resident.sponsorships.length}{" "}
                        {pluralize("sponsor", resident.sponsorships.length)}
                      </AdminBadge>
                    </div>
                  </div>
                  <AdminLink
                    className={styles.detailLink}
                    href={`/${orgSlug}/companions/${resident.id}`}
                    tone="mustard"
                  >
                    View companion page
                  </AdminLink>
                </div>

                <AdminTable>
                  <thead>
                    <tr>
                      <th scope="col">Sponsor</th>
                      <th scope="col">Contact</th>
                      <th scope="col">Channel</th>
                      <th scope="col">Status</th>
                      <th scope="col">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resident.sponsorships.map((sponsorship) => (
                      <tr key={sponsorship.id}>
                        <td>{sponsorship.sponsor.name}</td>
                        <td className={styles.contact}>
                          <a href={`mailto:${sponsorship.sponsor.email}`}>
                            {sponsorship.sponsor.email}
                          </a>
                          {sponsorship.sponsor.phone && (
                            <a href={`tel:${sponsorship.sponsor.phone}`}>
                              {sponsorship.sponsor.phone}
                            </a>
                          )}
                        </td>
                        <td className={styles.capitalize}>{sponsorship.sponsor.channel}</td>
                        <td className={styles.capitalize}>{sponsorship.status}</td>
                        <td>{formatDate(sponsorship.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              </AdminSurface>
            );
          })}
        </section>
      )}
      </AdminPage>
    </PageViewTransition>
  );
}
