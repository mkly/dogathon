import Image from "next/image";
import Link from "next/link";
import { io } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import pluralize from "pluralize";
import { Suspense } from "react";

import {
  AdminBadge,
  AdminEmptyState,
  AdminHeader,
  AdminLink,
  AdminPage as AdminPageShell,
  AdminSectionHeader,
  AdminSurface,
} from "@/components/admin-ui";
import { PhotoPatch } from "@/components/felt";
import { MotionReveal } from "@/components/motion-primitives";
import {
  PageViewTransition,
  SuspenseFallback,
  SuspenseReveal,
} from "@/components/page-view-transition";
import { SignOutButton } from "@/components/sign-out-button";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { formatDateTime, formatMonthlyAmount } from "@/lib/format";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { isRegularSponsorUpdateRecipient } from "@/lib/sponsor-update-delivery";

import pawcastWordmark from "../../../../../public/brand/pawcast-wordmark.png";

import { ComposeButton, DraftEditor } from "../admin-controls";
import { EMAIL_CONNECTOR_NOTICE_ID, emailConnectorBlockedReason } from "../gmail-notice";
import { STRIPE_CONNECT_NOTICE_ID, stripeNotReadyReason } from "../stripe-notice";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

type AdminPageProps = { params: Promise<{ orgSlug: string }> };

const STAFF_ROOM_LIST_LIMIT = 50;

async function getThirtyDaysAgo() {
  await io();
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

async function getCurrentTime() {
  await io();
  return Date.now();
}

async function DashboardStats({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const thirtyDaysAgo = await getThirtyDaysAgo();
  const [activeSponsorships, sponsoredCompanionCount, sentSponsorUpdateCount] = await Promise.all([
    prisma.sponsorship.aggregate({
      where: { orgId, status: "active" },
      _count: true,
      _sum: { monthlyCents: true },
    }),
    prisma.resident.count({
      where: {
        orgId,
        sponsorships: { some: { orgId, status: "active" } },
      },
    }),
    prisma.sponsorUpdate.count({
      where: {
        orgId,
        status: "sent",
        sentAt: { gte: thirtyDaysAgo },
      },
    }),
  ]);
  const activeSponsorCount = activeSponsorships._count;
  const monthlyRecurring = activeSponsorships._sum.monthlyCents ?? 0;

  return (
    <section aria-label="Program statistics" className={styles.stats}>
      <AdminSurface className={styles.stat} tone="mustard">
        <strong>{formatMonthlyAmount(monthlyRecurring)}</strong>
        <span>a month, recurring</span>
        <small>{activeSponsorCount} active {pluralize("sponsorship", activeSponsorCount)}</small>
      </AdminSurface>
      <Link
        aria-label={`View active sponsors (${activeSponsorCount} active)`}
        className={styles.statLink}
        href={`/${orgSlug}/admin/sponsors`}
        transitionTypes={["nav-forward"]}
      >
        <AdminSurface className={styles.stat} tone="moss">
          <strong>{activeSponsorCount}</strong>
          <span>active sponsors</span>
          <small>ready for the next update</small>
        </AdminSurface>
      </Link>
      <Link
        aria-label={`View companions covered (${sponsoredCompanionCount} with active sponsors)`}
        className={styles.statLink}
        href={`/${orgSlug}/admin/companions-covered`}
        transitionTypes={["nav-forward"]}
      >
        <AdminSurface className={styles.stat} tone="denim">
          <strong>{sponsoredCompanionCount}</strong>
          <span>companions covered</span>
          <small>with at least one active sponsor</small>
        </AdminSurface>
      </Link>
      <AdminSurface className={styles.stat} tone="brick">
        <strong>{sentSponsorUpdateCount}</strong>
        <span>updates sent</span>
        <small>in the last 30 days</small>
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
  const chatResidentResults = await prisma.resident.findMany({
    // once a draft exists the companion moves to the approval queue below,
    // so keep it out of the compose list until that draft is resolved
    where: {
      orgId,
      checkIns: { some: { sponsorUpdateId: null, status: "completed" } },
      sponsorUpdates: { none: { orgId, status: "draft" } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      breed: true,
      photoUrls: true,
      checkIns: {
        where: { sponsorUpdateId: null, status: "completed" },
        orderBy: { updatedAt: "desc" },
        select: {
          updatedAt: true,
          photos: {
            orderBy: { createdAt: "desc" },
            select: { url: true, webUrl: true },
            take: 1,
          },
        },
        take: 1,
      },
      _count: {
        select: { checkIns: { where: { sponsorUpdateId: null, status: "completed" } } },
      },
    },
    take: STAFF_ROOM_LIST_LIMIT + 1,
  });
  const chatResidentsTruncated = chatResidentResults.length > STAFF_ROOM_LIST_LIMIT;
  const chatResidents = chatResidentResults.slice(0, STAFF_ROOM_LIST_LIMIT);

  return (
    <section className={styles.composeSection}>
      <AdminSectionHeader
        actions={<AdminBadge tone="mustard">
          {chatResidents.length} {pluralize("companion", chatResidents.length)}
        </AdminBadge>}
        eyebrow="Volunteer chats"
        title="Chats ready for an update"
      />

      {chatResidentsTruncated && (
        <p className={styles.listLimitNotice} role="status">
          Showing the first {STAFF_ROOM_LIST_LIMIT} companions with chats ready for an update.
        </p>
      )}

      {chatResidents.length === 0 ? (
        <AdminSurface className={styles.composeEmpty} tone="oatmeal">
          No volunteer chats are waiting yet.
        </AdminSurface>
      ) : (
        <div className={styles.composeGrid}>
          {chatResidents.map((resident) => {
            const latestChat = resident.checkIns[0];
            const latestPhoto = latestChat?.photos[0];

            return (
              <AdminSurface className={styles.composeItem} key={resident.id} tone="oatmeal">
                <PhotoPatch
                  alt={`${resident.name} portrait`}
                  className={styles.composePhoto}
                  sizes="(max-width: 720px) 72px, 84px"
                  src={latestPhoto?.webUrl ?? latestPhoto?.url ?? resident.photoUrls[0]}
                />
                <div className={styles.composeCopy}>
                  <h3>
                    <Link
                      className={styles.composeName}
                      href={`/${orgSlug}/admin/companions/${resident.id}`}
                      transitionTypes={["nav-forward"]}
                    >
                      {resident.name}
                    </Link>
                  </h3>
                  <p className={styles.composeBreed}>{resident.breed}</p>
                  {latestChat ? <p className={styles.composeNote}>A completed volunteer chat is waiting.</p> : null}
                  <p className={styles.composeMeta}>
                    {resident._count.checkIns} {pluralize("volunteer chat", resident._count.checkIns)}
                    {latestChat && <> · Latest {formatDateTime(latestChat.updatedAt)} UTC</>}
                  </p>
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
    <section aria-label="Loading volunteer chats" className={styles.composeSection}>
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
  const [draftResults, emailConnector, currentTime] = await Promise.all([
    prisma.sponsorUpdate.findMany({
      where: { orgId, status: "draft" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        resident: {
          include: {
            sponsorships: {
              where: {
                orgId,
                status: "active",
              },
              select: { id: true, status: true },
            },
          },
        },
        sponsorship: {
          select: {
            id: true,
            status: true,
            awaitingSince: true,
            sponsor: { select: { name: true } },
          },
        },
      },
      take: STAFF_ROOM_LIST_LIMIT + 1,
    }),
    getEmailConnectorStatus(orgId),
    getCurrentTime(),
  ]);
  const draftsTruncated = draftResults.length > STAFF_ROOM_LIST_LIMIT;
  const drafts = draftResults.slice(0, STAFF_ROOM_LIST_LIMIT);

  return (
    <section className={styles.queueSection}>
      <AdminSectionHeader
        actions={<AdminBadge tone="brick">{drafts.length} {pluralize("draft", drafts.length)}</AdminBadge>}
        eyebrow="Approval queue"
        title="Waiting for your OK"
      />

      {draftsTruncated && (
        <p className={styles.listLimitNotice} role="status">
          Showing the first {STAFF_ROOM_LIST_LIMIT} drafts in the approval queue.
        </p>
      )}

      <MotionReveal
        animateOnMount
        className={styles.noticeReveal}
        show={!emailConnector.connected && drafts.length > 0}
      >
        <p className={styles.queueNotice} id={EMAIL_CONNECTOR_NOTICE_ID}>
          <span aria-hidden="true">✉️</span>
          <span>
            {emailConnectorBlockedReason()} Approving is on hold until then.{" "}
            {canManageStaffArea && (
              <Link
                href={`/${orgSlug}/admin/settings#${EMAIL_CONNECTOR_NOTICE_ID}`}
                transitionTypes={["nav-forward"]}
              >
                Open email settings.
              </Link>
            )}
          </span>
        </p>
      </MotionReveal>

      <div className={styles.queue} id="draft-queue" tabIndex={-1}>
        {drafts.length === 0 ? (
          <AdminSurface tone="oatmeal">
            <AdminEmptyState variant="dashboard">
              <span aria-hidden="true">🐾</span>
              <h3>The queue is clear</h3>
              <p>Fresh volunteer chats will become drafts here.</p>
            </AdminEmptyState>
          </AdminSurface>
        ) : (
          drafts.map((draft) => {
            const graduation = draft.type === "graduation";
            const recipientCount = draft.resident.sponsorships.filter((sponsorship) =>
              isRegularSponsorUpdateRecipient(sponsorship, draft.resident.available)).length;
            const waitingDays = Math.max(
              0,
              Math.floor((currentTime - (
                draft.isAwaitingReminder && draft.sponsorship?.awaitingSince
                  ? draft.sponsorship.awaitingSince.getTime()
                  : draft.createdAt.getTime()
              )) / (24 * 60 * 60 * 1000)),
            );
            return <DraftEditor
              bodyText={draft.bodyText}
              emailConnected={emailConnector.connected}
              focusTargetId="draft-queue"
              id={draft.id}
              isAwaitingReminder={draft.isAwaitingReminder}
              isGraduation={graduation}
              key={draft.id}
              orgSlug={orgSlug}
              subject={draft.subject}
              teaser={draft.teaser}
            >
              <PhotoPatch alt={`${draft.resident.name} update`} className={styles.photo} sizes="(max-width: 720px) 104px, 120px" src={draft.heroPhotoUrl ?? draft.resident.photoUrls[0]} />
              <div className={styles.companionSummary}>
                <AdminBadge tone={draft.type === "graduation" ? "mustard" : "denim"}>{draft.type}</AdminBadge>
                <h3>{draft.resident.name}</h3>
                <p>{draft.resident.personality}</p>
                <small>
                  {graduation && draft.sponsorship
                    ? `for ${draft.sponsorship.sponsor.name} · waiting ${waitingDays} ${pluralize("day", waitingDays)}`
                    : <>goes to {recipientCount} {pluralize("sponsor", recipientCount)}</>}
                </small>
              </div>
            </DraftEditor>;
          })
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
        <Link
          href={`/${orgSlug}/admin/settings#${STRIPE_CONNECT_NOTICE_ID}`}
          transitionTypes={["nav-forward"]}
        >
          Open Stripe settings.
        </Link>
      </span>
    </p>
  );
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    sponsorUpdate: ["manage"],
  });

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;
  const canManageStaffArea = context.role === "owner" || context.role === "admin";

  return (
    <PageViewTransition>
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
          brand={<Link href={`/${orgSlug}`} transitionTypes={["nav-back"]}>
            <Image alt="Pawcast" preload src={pawcastWordmark} />
          </Link>}
          title="Staff room"
        />

        {canManageStaffArea && (
          <Suspense fallback={null}>
            <StripeNotice orgId={context.orgId} orgSlug={orgSlug} />
          </Suspense>
        )}

        {canManageStaffArea && (
          <Suspense fallback={<SuspenseFallback><DashboardStatsLoading /></SuspenseFallback>}>
            <SuspenseReveal><DashboardStats orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
          </Suspense>
        )}

        <Suspense fallback={<SuspenseFallback><ComposeSectionLoading /></SuspenseFallback>}>
          <SuspenseReveal><ComposeSection orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
        </Suspense>

        <Suspense fallback={<SuspenseFallback><ApprovalQueueLoading /></SuspenseFallback>}>
          <SuspenseReveal><ApprovalQueue canManageStaffArea={canManageStaffArea} orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
        </Suspense>
      </AdminPageShell>
    </PageViewTransition>
  );
}
