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
import { checkOrganizationPermission, getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

import { SponsorshipControls } from "./sponsorship-controls";
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
  const requestHeaders = await headers();
  const access = await getOrganizationAccessBySlug(requestHeaders, orgSlug, {
    sponsors: ["read"],
  });

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/sponsors/${sponsorId}`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;
  const canManageSponsorships = await checkOrganizationPermission(requestHeaders, context.orgId, {
    sponsorUpdate: ["manage"],
  });

  const [sponsor, ongoingSponsorships, availableResidents] = await Promise.all([
    prisma.sponsor.findFirst({
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
    }),
    prisma.sponsorship.findMany({
      where: { orgId: context.orgId, sponsorId, status: { in: ["active", "awaiting"] } },
      select: {
        id: true,
        status: true,
        resident: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    }),
    canManageSponsorships ? prisma.resident.findMany({
      where: {
        orgId: context.orgId,
        available: true,
        sponsorships: { none: { status: "active" } },
      },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }) : Promise.resolve([]),
  ]);

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

        {ongoingSponsorships.length > 0 ? (
          <section aria-labelledby="awaiting-heading" className={styles.awaitingSection}>
            <div className={styles.historyTitle}>
              <h2 id="awaiting-heading">Manage sponsorships</h2>
              <AdminBadge tone="brick">{ongoingSponsorships.length} ongoing</AdminBadge>
            </div>
            <p className={styles.limitNotice}>
              Sponsorships keep renewing while sponsors are between companions. Staff can move an
              active sponsorship or one choosing a next companion at any time.
            </p>
            <AdminSurface className={styles.historyPanel} tone="mustard">
              <AdminTable>
                <thead>
                  <tr>
                    <th scope="col">Companion</th>
                    <th scope="col">Status</th>
                    {canManageSponsorships ? <th scope="col">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {ongoingSponsorships.map((sponsorship) => (
                    <tr key={sponsorship.id}>
                      <td>{sponsorship.resident.name}</td>
                      <td><AdminStatus>{sponsorshipStatusLabel(sponsorship.status)}</AdminStatus></td>
                      {canManageSponsorships ? (
                        <td>
                          <SponsorshipControls
                            availableResidents={availableResidents}
                            canEnd={sponsorship.status === "awaiting"}
                            currentCompanionName={sponsorship.resident.name}
                            orgSlug={orgSlug}
                            sponsorshipId={sponsorship.id}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </AdminSurface>
          </section>
        ) : null}

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
