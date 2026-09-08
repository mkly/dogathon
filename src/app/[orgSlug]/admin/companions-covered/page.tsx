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
import { formatDate, sponsorshipStatusLabel } from "@/lib/format";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import styles from "./companions-covered.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Companions covered | Dogathon staff",
  description: "Private sponsorship directory grouped by companion for Dogathon staff.",
};

type CompanionsCoveredPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DIRECTORY_PAGE_SIZE = 50;
const SPONSORSHIPS_PER_COMPANION_LIMIT = 100;

function pageFromQuery(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function CompanionsCoveredPage({ params, searchParams }: CompanionsCoveredPageProps) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const page = pageFromQuery(query.page);
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    sponsors: ["read"],
  });

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/companions-covered`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  const residentWhere = {
    orgId: context.orgId,
    sponsorships: { some: { orgId: context.orgId } },
  };
  const [residentCount, sponsorshipCount, activelyCoveredCount, residents] = await Promise.all([
    prisma.resident.count({ where: residentWhere }),
    prisma.sponsorship.count({ where: { orgId: context.orgId } }),
    prisma.resident.count({
      where: { orgId: context.orgId, sponsorships: { some: { orgId: context.orgId, status: "active" } } },
    }),
    prisma.resident.findMany({
      where: residentWhere,
      select: {
        id: true,
        name: true,
        breed: true,
        photoUrls: true,
        available: true,
        _count: { select: { sponsorships: { where: { orgId: context.orgId } } } },
        sponsorships: {
          where: { orgId: context.orgId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            sponsor: { select: { email: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
          take: SPONSORSHIPS_PER_COMPANION_LIMIT,
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * DIRECTORY_PAGE_SIZE,
      take: DIRECTORY_PAGE_SIZE,
    }),
  ]);
  const hasPreviousPage = page > 1;
  const hasNextPage = page * DIRECTORY_PAGE_SIZE < residentCount;

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
            {residentCount} {pluralize("companion", residentCount)} · {sponsorshipCount}{" "}
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
                      sizes="(max-width: 720px) 78px, 96px"
                      src={resident.photoUrls[0]}
                    />
                    <div className={styles.companionDetails}>
                      <h2>{resident.name}</h2>
                      <p>{resident.breed}</p>
                      <div className={styles.badges}>
                        <AdminBadge tone={resident.available ? "denim" : "brick"}>
                          {resident.available ? "Available" : "Not available"}
                        </AdminBadge>
                        <AdminBadge tone={hasActiveSponsor ? "moss" : "brick"}>
                          {resident._count.sponsorships}{" "}
                          {pluralize("sponsor", resident._count.sponsorships)}
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
                          </td>
                          <td>{sponsorshipStatusLabel(sponsorship.status)}</td>
                          <td>{formatDate(sponsorship.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </AdminTable>
                  {resident._count.sponsorships > SPONSORSHIPS_PER_COMPANION_LIMIT ? (
                    <p className={styles.limitNotice}>
                      Showing the first {SPONSORSHIPS_PER_COMPANION_LIMIT} sponsorships.
                    </p>
                  ) : null}
                </AdminSurface>
              );
            })}
          </section>
        )}

        {(hasPreviousPage || hasNextPage) && (
          <nav aria-label="Companions covered pages" className={styles.pagination}>
            {hasPreviousPage ? (
              <AdminLink href={page === 2 ? `/${orgSlug}/admin/companions-covered` : `/${orgSlug}/admin/companions-covered?page=${page - 1}`}>
                Previous page
              </AdminLink>
            ) : <span />}
            <span>Page {page}</span>
            {hasNextPage ? (
              <AdminLink href={`/${orgSlug}/admin/companions-covered?page=${page + 1}`}>Next page</AdminLink>
            ) : <span />}
          </nav>
        )}
      </AdminPage>
    </PageViewTransition>
  );
}
