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
import { formatDate, sponsorshipStatusLabel } from "@/lib/format";
import { PageViewTransition } from "@/components/page-view-transition";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import styles from "../sponsors.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sponsors | Dogathon staff",
  description: "Private sponsor directory for Dogathon staff.",
};

type SponsorsPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DIRECTORY_PAGE_SIZE = 50;
const SPONSORSHIPS_PER_SPONSOR_LIMIT = 100;

function pageFromQuery(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SponsorsPage({
  params,
  searchParams,
}: SponsorsPageProps) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const page = pageFromQuery(query.page);
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    sponsors: ["read"],
  });

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/sponsors`);
    redirect(
      access.authenticated
        ? "/staff/organizations"
        : `/staff/sign-in?next=${next}`,
    );
  }
  const { context } = access;

  const sponsorWhere = { sponsorships: { some: { orgId: context.orgId } } };
  const [sponsorCount, sponsorshipCount, sponsors] = await Promise.all([
    prisma.sponsor.count({ where: sponsorWhere }),
    prisma.sponsorship.count({ where: { orgId: context.orgId } }),
    prisma.sponsor.findMany({
      where: sponsorWhere,
      select: {
        id: true,
        email: true,
        name: true,
        _count: {
          select: { sponsorships: { where: { orgId: context.orgId } } },
        },
        sponsorships: {
          where: { orgId: context.orgId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            resident: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
          take: SPONSORSHIPS_PER_SPONSOR_LIMIT,
        },
      },
      orderBy: [{ email: "asc" }, { id: "asc" }],
      skip: (page - 1) * DIRECTORY_PAGE_SIZE,
      take: DIRECTORY_PAGE_SIZE,
    }),
  ]);
  const hasPreviousPage = page > 1;
  const hasNextPage = page * DIRECTORY_PAGE_SIZE < sponsorCount;

  return (
    <PageViewTransition>
      <AdminPage variant="directory">
        <AdminHeader
          actions={
            <AdminLink
              className={styles.backLink}
              href={`/${orgSlug}/admin`}
              transitionTypes={["nav-back"]}
            >
              Back to staff room
            </AdminLink>
          }
          eyebrow="Private staff directory"
          lede="Contact preferences and every companion supported by each sponsor."
          title="Sponsors"
          variant="directory"
        />

        <div className={styles.summary}>
          <p>
            {sponsorCount} {pluralize("person", sponsorCount)} ·{" "}
            {sponsorshipCount} {pluralize("sponsorship", sponsorshipCount)}
          </p>
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
          <section
            aria-label="Sponsor directory"
            className={styles.sponsorList}
          >
            {sponsors.map((sponsor) => (
              <AdminSurface
                className={styles.sponsorCard}
                key={sponsor.id}
                tone="oatmeal"
              >
                <div className={styles.sponsorHeading}>
                  <div>
                    <h2>{sponsor.name}</h2>
                    <AdminBadge
                      tone={
                        sponsor.sponsorships.some(
                          ({ status }) => status === "active",
                        )
                          ? "moss"
                          : "brick"
                      }
                    >
                      {sponsor._count.sponsorships}{" "}
                      {pluralize("companion", sponsor._count.sponsorships)}
                    </AdminBadge>
                  </div>
                  <div className={styles.contact}>
                    <p>
                      <a href={`mailto:${sponsor.email}`}>{sponsor.email}</a>
                    </p>
                    <AdminLink
                      href={`/${orgSlug}/admin/sponsors/${sponsor.id}`}
                      tone="mustard"
                    >
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
                        <td>
                          <AdminStatus>
                            {sponsorshipStatusLabel(record.status)}
                          </AdminStatus>
                        </td>
                        <td>{formatDate(record.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
                {sponsor._count.sponsorships >
                SPONSORSHIPS_PER_SPONSOR_LIMIT ? (
                  <p className={styles.limitNotice}>
                    Showing the first {SPONSORSHIPS_PER_SPONSOR_LIMIT}{" "}
                    sponsorships.
                  </p>
                ) : null}
              </AdminSurface>
            ))}
          </section>
        )}

        {(hasPreviousPage || hasNextPage) && (
          <nav
            aria-label="Sponsor directory pages"
            className={styles.pagination}
          >
            {hasPreviousPage ? (
              <AdminLink
                href={
                  page === 2
                    ? `/${orgSlug}/admin/sponsors`
                    : `/${orgSlug}/admin/sponsors?page=${page - 1}`
                }
              >
                Previous page
              </AdminLink>
            ) : (
              <span />
            )}
            <span>Page {page}</span>
            {hasNextPage ? (
              <AdminLink href={`/${orgSlug}/admin/sponsors?page=${page + 1}`}>
                Next page
              </AdminLink>
            ) : (
              <span />
            )}
          </nav>
        )}
      </AdminPage>
    </PageViewTransition>
  );
}
