import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

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
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import pawcastWordmark from "../../../../public/brand/pawcast-wordmark.png";

import { ComposeButton, DraftEditor } from "./admin-controls";
import { EMAIL_CONNECTOR_NOTICE_ID, emailConnectorBlockedReason } from "./gmail-notice";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

type AdminPageProps = { params: Promise<{ orgSlug: string }> };

export default async function AdminPage({ params }: AdminPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, ["owner", "admin"]);

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin`);
    redirect(access.authenticated ? "/organizations" : `/sign-in?next=${next}`);
  }
  const { context } = access;

  const [
    drafts,
    noteResidents,
    activeSponsorCount,
    sponsoredCompanionCount,
    emailConnector,
  ] =
    await Promise.all([
      prisma.pupdate.findMany({
        where: { orgId: context.orgId, status: "draft" },
        orderBy: { createdAt: "asc" },
        include: {
          resident: {
            include: {
              sponsorships: {
                where: { orgId: context.orgId, status: "active" },
                select: { id: true },
              },
            },
          },
        },
      }),
      prisma.resident.findMany({
        // once a draft exists the companion moves to the approval queue below,
        // so keep it out of the compose list until that draft is resolved
        where: {
          orgId: context.orgId,
          volunteerNotes: { some: { orgId: context.orgId } },
          pupdates: { none: { orgId: context.orgId, status: "draft" } },
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
      }),
      prisma.sponsorship.count({ where: { orgId: context.orgId, status: "active" } }),
      prisma.resident.count({
        where: {
          orgId: context.orgId,
          sponsorships: { some: { orgId: context.orgId, status: "active" } },
        },
      }),
      getEmailConnectorStatus(context.orgId),
    ]);

  const monthlyRecurring = activeSponsorCount * 25;

  return (
    <AdminPageShell>
      <AdminHeader
        actions={
          <>
            <AdminLink href={`/${orgSlug}/admin/members`} tone="oatmeal">
              Members
            </AdminLink>
            <AdminLink href={`/${orgSlug}/admin/settings`} tone="oatmeal">
              Settings
            </AdminLink>
            <SignOutButton />
          </>
        }
        brand={<Link href={`/${orgSlug}`}>
          <Image alt="Pawcast" priority src={pawcastWordmark} />
        </Link>}
        title="Staff room"
      />

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

      <section className={styles.composeSection}>
        <AdminSectionHeader
          actions={<AdminBadge tone="mustard">
            {noteResidents.length} {noteResidents.length === 1 ? "companion" : "companions"}
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
                      {resident._count.volunteerNotes}{" "}
                      {resident._count.volunteerNotes === 1 ? "volunteer note" : "volunteer notes"}
                    </p>
                    {latestNote && (
                      <small>
                        Latest {latestNote.toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "America/Los_Angeles",
                        })} PT
                      </small>
                    )}
                  </div>
                  <ComposeButton orgSlug={orgSlug} residentId={resident.id} residentName={resident.name} />
                </AdminSurface>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.queueSection}>
        <AdminSectionHeader
          actions={<AdminBadge tone="brick">{drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</AdminBadge>}
          eyebrow="Approval queue"
          title="Waiting for your OK"
        />

        {!emailConnector.connected && drafts.length > 0 && (
          <p className={styles.queueNotice} id={EMAIL_CONNECTOR_NOTICE_ID}>
            <span aria-hidden="true">✉️</span>
            <span>
              {emailConnectorBlockedReason()} Approving is on hold until then.{" "}
              <Link href={`/${orgSlug}/admin/settings#${EMAIL_CONNECTOR_NOTICE_ID}`}>
                Open email settings.
              </Link>
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
                <PhotoPatch
                  alt={`${draft.resident.name} portrait`}
                  className={styles.photo}
                  src={draft.resident.photoUrls[0]}
                />
                <div className={styles.companionSummary}>
                  <AdminBadge tone={draft.type === "graduation" ? "mustard" : "denim"}>
                    {draft.type}
                  </AdminBadge>
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

      <AdminFooter>the staff room · nobody wrote a single email today</AdminFooter>
    </AdminPageShell>
  );
}
