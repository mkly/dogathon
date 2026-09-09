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
import { formatMonthlyAmount } from "@/lib/format";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { pendingCheckInsWhere } from "@/lib/pending-check-ins";
import { prisma } from "@/lib/prisma";
import { isRegularSponsorUpdateRecipient } from "@/lib/sponsor-update-delivery";

import pawcastWordmark from "../../../../../public/brand/pawcast-wordmark.png";

import { ComposeButton, DraftEditor } from "../admin-controls";
import { EMAIL_CONNECTOR_NOTICE_ID, emailConnectorBlockedReason } from "../gmail-notice";
import { STRIPE_CONNECT_NOTICE_ID, stripeNotReadyReason } from "../stripe-notice";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type UpdatesTab = "ready" | "waiting";

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

function relativeSentTime(sentAt: Date, currentTime: number) {
  const elapsedDays = Math.max(0, Math.floor((currentTime - sentAt.getTime()) / 86_400_000));
  if (elapsedDays === 0) return "today";
  if (elapsedDays === 1) return "yesterday";
  if (elapsedDays < 30) return `${elapsedDays} days ago`;

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `${elapsedMonths} ${pluralize("month", elapsedMonths)} ago`;
  }

  const elapsedYears = Math.floor(elapsedMonths / 12);
  return `${elapsedYears} ${pluralize("year", elapsedYears)} ago`;
}

async function UpdatesSection({
  activeTab,
  orgId,
  orgSlug,
}: {
  activeTab: UpdatesTab;
  orgId: string;
  orgSlug: string;
}) {
  const [sponsoredResidents, currentTime] = await Promise.all([
    prisma.resident.findMany({
      where: {
        orgId,
        sponsorships: {
          some: { orgId, status: { in: ["active", "awaiting"] } },
        },
      },
      select: {
        id: true,
        name: true,
        photoUrls: true,
        checkIns: {
          where: pendingCheckInsWhere(),
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          select: { updatedAt: true },
          take: 1,
        },
        sponsorUpdates: {
          where: { orgId, status: "sent" },
          orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
          select: { createdAt: true, sentAt: true },
          take: 1,
        },
        _count: {
          select: {
            checkIns: { where: pendingCheckInsWhere() },
            sponsorUpdates: {
              where: { orgId, status: { in: ["draft", "approved"] } },
            },
          },
        },
      },
    }),
    getCurrentTime(),
  ]);

  const byName = (a: (typeof sponsoredResidents)[number], b: (typeof sponsoredResidents)[number]) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const readyResidents = sponsoredResidents
    .filter((resident) => resident._count.checkIns > 0 && resident._count.sponsorUpdates === 0)
    .sort((a, b) =>
      b._count.checkIns - a._count.checkIns ||
      (a.checkIns[0]?.updatedAt.getTime() ?? 0) - (b.checkIns[0]?.updatedAt.getTime() ?? 0) ||
      byName(a, b));
  const waitingResidents = sponsoredResidents
    .filter((resident) => resident._count.checkIns === 0)
    .sort((a, b) => {
      const aSentAt = a.sponsorUpdates[0]?.sentAt ?? a.sponsorUpdates[0]?.createdAt;
      const bSentAt = b.sponsorUpdates[0]?.sentAt ?? b.sponsorUpdates[0]?.createdAt;
      if (!aSentAt && bSentAt) return -1;
      if (aSentAt && !bSentAt) return 1;
      return (aSentAt?.getTime() ?? 0) - (bSentAt?.getTime() ?? 0) || byName(a, b);
    });
  const activeResidents = activeTab === "ready" ? readyResidents : waitingResidents;
  const residentsTruncated = activeResidents.length > STAFF_ROOM_LIST_LIMIT;
  const residents = activeResidents.slice(0, STAFF_ROOM_LIST_LIMIT);

  return (
    <section className={styles.updatesSection}>
      <AdminSectionHeader
        eyebrow="Volunteer chats"
        title="Updates"
      />

      <nav aria-label="Update queues" className={styles.updateTabs}>
        <Link
          aria-current={activeTab === "ready" ? "page" : undefined}
          className={activeTab === "ready" ? styles.updateTabActive : styles.updateTab}
          href={`/${orgSlug}/admin?updates=ready`}
        >
          Ready to compose ({readyResidents.length})
        </Link>
        <Link
          aria-current={activeTab === "waiting" ? "page" : undefined}
          className={activeTab === "waiting" ? styles.updateTabActive : styles.updateTab}
          href={`/${orgSlug}/admin?updates=waiting`}
        >
          Waiting on volunteers ({waitingResidents.length})
        </Link>
      </nav>

      {residentsTruncated && (
        <p className={styles.listLimitNotice} role="status">
          Showing the first {STAFF_ROOM_LIST_LIMIT} companions in this list.
        </p>
      )}

      {residents.length === 0 ? (
        <AdminSurface tone="oatmeal">
          <AdminEmptyState variant="dashboard">
            <span aria-hidden="true">🐾</span>
            <h3>{activeTab === "ready" ? "Nothing to compose yet" : "Everyone has a chat ready"}</h3>
            <p>
              {activeTab === "ready"
                ? "Completed volunteer chats will appear here."
                : "There are no sponsored companions waiting on volunteers."}
            </p>
          </AdminEmptyState>
        </AdminSurface>
      ) : (
        <div className={styles.updateList}>
          {residents.map((resident) => {
            const lastSentAt = resident.sponsorUpdates[0]?.sentAt ?? resident.sponsorUpdates[0]?.createdAt;

            return (
              <AdminSurface className={styles.updateRow} key={resident.id} tone="oatmeal">
                <PhotoPatch
                  alt={`${resident.name} portrait`}
                  className={styles.updatePhoto}
                  sizes="(max-width: 620px) 64px, 72px"
                  src={resident.photoUrls[0]}
                />
                <div className={styles.updateCopy}>
                  <h3>
                    <Link
                      className={styles.updateName}
                      href={`/${orgSlug}/admin/companions/${resident.id}`}
                      transitionTypes={["nav-forward"]}
                    >
                      {resident.name}
                    </Link>
                  </h3>
                  <AdminBadge tone={activeTab === "ready" ? "mustard" : "oatmeal"}>
                    {resident._count.checkIns} {pluralize("chat", resident._count.checkIns)} collected
                  </AdminBadge>
                  <p className={styles.updateMeta}>
                    {lastSentAt
                      ? `Last update sent ${relativeSentTime(lastSentAt, currentTime)}`
                      : "No update sent yet"}
                  </p>
                </div>
                {activeTab === "ready" ? (
                  <ComposeButton orgSlug={orgSlug} residentId={resident.id} residentName={resident.name} />
                ) : null}
              </AdminSurface>
            );
          })}
        </div>
      )}
    </section>
  );
}

function UpdatesSectionLoading() {
  return (
    <section aria-label="Loading updates" className={styles.updatesSection}>
      <div className={`${styles.sectionSkeleton} ${styles.skeleton}`} />
      <div className={styles.updateList}>
        <AdminSurface className={`${styles.updateRow} ${styles.skeleton}`} tone="oatmeal" />
        <AdminSurface className={`${styles.updateRow} ${styles.skeleton}`} tone="oatmeal" />
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

export default async function AdminPage({ params, searchParams }: AdminPageProps) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const updatesTab: UpdatesTab = query.updates === "waiting" ? "waiting" : "ready";
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

        <Suspense fallback={<SuspenseFallback><UpdatesSectionLoading /></SuspenseFallback>}>
          <SuspenseReveal>
            <UpdatesSection activeTab={updatesTab} orgId={context.orgId} orgSlug={orgSlug} />
          </SuspenseReveal>
        </Suspense>

        <Suspense fallback={<SuspenseFallback><ApprovalQueueLoading /></SuspenseFallback>}>
          <SuspenseReveal><ApprovalQueue canManageStaffArea={canManageStaffArea} orgId={context.orgId} orgSlug={orgSlug} /></SuspenseReveal>
        </Suspense>
      </AdminPageShell>
    </PageViewTransition>
  );
}
