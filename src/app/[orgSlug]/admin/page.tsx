import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import pluralize from "pluralize";
import { Suspense } from "react";

import {
  AdminBadge,
  AdminEmptyState,
  AdminFooter,
  AdminHeader,
  AdminLink,
  AdminPage as AdminPageShell,
  AdminSectionHeader,
  AdminSurface,
} from "@/components/admin-ui";
import { PhotoPatch } from "@/components/felt";
import { SignOutButton } from "@/components/sign-out-button";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { formatDateTime } from "@/lib/format";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import pawcastWordmark from "../../../../public/brand/pawcast-wordmark.png";

import { ComposeButton, DraftEditor } from "./admin-controls";
import { EMAIL_CONNECTOR_NOTICE_ID, emailConnectorBlockedReason } from "./gmail-notice";
import { STRIPE_CONNECT_NOTICE_ID, stripeNotReadyReason } from "./stripe-notice";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

type AdminPageProps = { params: Promise<{ orgSlug: string }> };

async function DashboardStats({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const [activeSponsorCount, sponsoredCompanionCount] = await Promise.all([
    prisma.sponsorship.count({ where: { orgId, status: "active" } }),
    prisma.resident.count({
      where: {
        orgId,
        sponsorships: { some: { orgId, status: "active" } },
      },
    }),
  ]);
  const monthlyRecurring = activeSponsorCount * 25;

  return (
    <section aria-label="Program statistics" className={styles.stats}>
      <AdminSurface className={styles.stat} tone="mustard">
        <strong>${monthlyRecurring.toLocaleString()}</strong>
        <span>a month, recurring</span>
        <small>active sponsorships × $25</small>
      </AdminSurface>
      <Link
        aria-label={`View active sponsors (${activeSponsorCount} active)`}
        className={styles.statLink}
        href={`/${orgSlug}/admin/sponsors`}
      >
        <AdminSurface className={styles.stat} tone="moss">
          <strong>{activeSponsorCount}</strong>
          <span>active sponsors</span>
          <small>ready for the next pupdate</small>
        </AdminSurface>
      </Link>
      <Link
        aria-label={`View companions covered (${sponsoredCompanionCount} with active sponsors)`}
        className={styles.statLink}
        href={`/${orgSlug}/admin/companions-covered`}
      >
        <AdminSurface className={styles.stat} tone="denim">
          <strong>{sponsoredCompanionCount}</strong>
          <span>companions covered</span>
          <small>with at least one active sponsor</small>
        </AdminSurface>
      </Link>
      <AdminSurface className={styles.stat} tone="brick">
        <strong>92%</strong>
        <span>updates opened</span>
        <small>people love hearing from their companions</small>
      </AdminSurface>
    </section>
  );
}

function DashboardStatsLoading() {
  return (
    <section aria-label="Loading program statistics" className={styles.stats}>
      {(["mustard", "moss", "denim", "brick"] as const).map((tone) => (
        <AdminSurface className={`${styles.stat} ${styles.skeleton}`} key={tone} tone={tone} />
      ))}
    </section>
  );
}

async function ComposeSection({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const noteResidents = await prisma.resident.findMany({
    // once a draft exists the companion moves to the approval queue below,
    // so keep it out of the compose list until that draft is resolved
    where: {
      orgId,
      volunteerNotes: { some: { orgId } },
      pupdates: { none: { orgId, status: "draft" } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      breed: true,
      photoUrls: true,
      volunteerNotes: {
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
        take: 1,
      },
      _count: { select: { volunteerNotes: true } },
    },
  });

  return (
    <section className={styles.composeSection}>
      <AdminSectionHeader
        actions={<AdminBadge tone="mustard">
          {noteResidents.length} {pluralize("companion", noteResidents.length)}
        </AdminBadge>}
        eyebrow="Volunteer notebook"
        title="Notes ready for a pupdate"
      />

      {noteResidents.length === 0 ? (
        <AdminSurface className={styles.composeEmpty} tone="oatmeal">
          No volunteer notes are waiting yet.
        </AdminSurface>
      ) : (
        <div className={styles.composeGrid}>
          {noteResidents.map((resident) => {
            const latestNote = resident.volunteerNotes[0]?.createdAt;

            return (
              <AdminSurface className={styles.composeItem} key={resident.id} tone="oatmeal">
                <PhotoPatch
                  alt={`${resident.name} portrait`}
                  className={styles.composePhoto}
                  src={resident.photoUrls[0]}
                />
                <div className={styles.composeCopy}>
                  <h3>{resident.name}</h3>
                  <p className={styles.composeBreed}>{resident.breed}</p>
                  <p>
                    {resident._count.volunteerNotes} {pluralize("volunteer note", resident._count.volunteerNotes)}
                  </p>
                  {latestNote && <small>Latest {formatDateTime(latestNote)} UTC</small>}
                </div>
                <ComposeButton orgSlug={orgSlug} residentId={resident.id} residentName={resident.name} />
              </AdminSurface>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ComposeSectionLoading() {
  return (
    <section aria-label="Loading volunteer notes" className={styles.composeSection}>
      <div className={`${styles.sectionSkeleton} ${styles.skeleton}`} />
      <div className={styles.composeGrid}>
        <AdminSurface className={`${styles.composeItem} ${styles.skeleton}`} tone="oatmeal" />
        <AdminSurface className={`${styles.composeItem} ${styles.skeleton}`} tone="oatmeal" />
      </div>
    </section>
  );
}

async function ApprovalQueue({
  canManageStaffArea,
  orgId,
  orgSlug,
}: {
  canManageStaffArea: boolean;
  orgId: string;
  orgSlug: string;
}) {
  const [drafts, emailConnector] = await Promise.all([
    prisma.pupdate.findMany({
      where: { orgId, status: "draft" },
      orderBy: { createdAt: "asc" },
      include: {
        resident: {
          include: {
            sponsorships: {
              where: { orgId, status: "active" },
              select: { id: true },
            },
          },
        },
      },
    }),
    getEmailConnectorStatus(orgId),
  ]);

  return (
    <section className={styles.queueSection}>
      <AdminSectionHeader
        actions={<AdminBadge tone="brick">{drafts.length} {pluralize("draft", drafts.length)}</AdminBadge>}
        eyebrow="Approval queue"
        title="Waiting for your OK"
      />

      {!emailConnector.connected && drafts.length > 0 && (
        <p className={styles.queueNotice} id={EMAIL_CONNECTOR_NOTICE_ID}>
          <span aria-hidden="true">✉️</span>
          <span>
            {emailConnectorBlockedReason()} Approving is on hold until then.{" "}
            {canManageStaffArea && (
              <Link href={`/${orgSlug}/admin/settings#${EMAIL_CONNECTOR_NOTICE_ID}`}>
                Open email settings.
              </Link>
            )}
          </span>
        </p>
      )}

      <div className={styles.queue}>
        {drafts.length === 0 ? (
          <AdminSurface tone="oatmeal">
            <AdminEmptyState variant="dashboard">
              <span aria-hidden="true">🐾</span>
              <h3>The queue is clear</h3>
              <p>Fresh volunteer notes will become drafts here.</p>
            </AdminEmptyState>
          </AdminSurface>
        ) : (
          drafts.map((draft) => (
            <AdminSurface className={styles.queueItem} key={draft.id} tone="oatmeal">
              <PhotoPatch alt={`${draft.resident.name} portrait`} className={styles.photo} src={draft.resident.photoUrls[0]} />
              <div className={styles.companionSummary}>
                <AdminBadge tone={draft.type === "graduation" ? "mustard" : "denim"}>{draft.type}</AdminBadge>
                <h3>{draft.resident.name}</h3>
                <p>{draft.resident.personality}</p>
                <small>goes to {draft.resident.sponsorships.length} sponsors</small>
              </div>
              <DraftEditor
                bodyText={draft.bodyText}
                emailConnected={emailConnector.connected}
                id={draft.id}
                orgSlug={orgSlug}
                smsText={draft.smsText}
                subject={draft.subject}
              />
            </AdminSurface>
          ))
        )}
      </div>
    </section>
  );
}

function ApprovalQueueLoading() {
  return (
    <section aria-label="Loading approval queue" className={styles.queueSection}>
      <div className={`${styles.sectionSkeleton} ${styles.skeleton}`} />
      <div className={styles.queue}>
        <AdminSurface className={`${styles.queueItem} ${styles.queueSkeleton} ${styles.skeleton}`} tone="oatmeal" />
      </div>
    </section>
  );
}

async function StripeNotice({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const stripeConnection = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripeDetailsSubmitted: true,
    },
  });
  const stripeNotReady = stripeNotReadyReason(stripeConnection);
  if (!stripeNotReady) return null;

  return (
    <p className={styles.queueNotice} role="status">
      <span aria-hidden="true">⚠️</span>
      <span>
        {stripeNotReady} Sponsors cannot check out until Stripe enables card payments.{" "}
        <Link href={`/${orgSlug}/admin/settings#${STRIPE_CONNECT_NOTICE_ID}`}>
          Open Stripe settings.
        </Link>
      </span>
    </p>
  );
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    pupdate: ["manage"],
  });

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;
  const canManageStaffArea = context.role === "owner" || context.role === "admin";

  return (
    <AdminPageShell>
      <AdminHeader
        actions={
          <>
            {canManageStaffArea && (
              <>
                <AdminLink href={`/${orgSlug}/admin/members`} tone="oatmeal">
                  Members
                </AdminLink>
                <AdminLink href={`/${orgSlug}/admin/settings`} tone="oatmeal">
                  Settings
                </AdminLink>
              </>
            )}
            <SignOutButton />
          </>
        }
        brand={<Link href={`/${orgSlug}`}>
          <Image alt="Pawcast" priority src={pawcastWordmark} />
        </Link>}
        title="Staff room"
      />

      {canManageStaffArea && (
        <Suspense fallback={null}>
          <StripeNotice orgId={context.orgId} orgSlug={orgSlug} />
        </Suspense>
      )}

      {canManageStaffArea && (
        <Suspense fallback={<DashboardStatsLoading />}>
          <DashboardStats orgId={context.orgId} orgSlug={orgSlug} />
        </Suspense>
      )}

      <Suspense fallback={<ComposeSectionLoading />}>
        <ComposeSection orgId={context.orgId} orgSlug={orgSlug} />
      </Suspense>

      <Suspense fallback={<ApprovalQueueLoading />}>
        <ApprovalQueue canManageStaffArea={canManageStaffArea} orgId={context.orgId} orgSlug={orgSlug} />
      </Suspense>

      <AdminFooter>the staff room · nobody wrote a single email today</AdminFooter>
    </AdminPageShell>
  );
}
