import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AdminBadge, AdminButton, AdminSurface } from "@/components/admin-ui";
import { PhotoPatch } from "@/components/felt";
import { SignOutButton } from "@/components/sign-out-button";
import { gmailAuthStatus } from "@/lib/arcade";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import pawcastWordmark from "../../../../public/brand/pawcast-wordmark.png";

import { beginStripeOnboarding } from "./actions";
import { ComposeButton, DraftEditor, SettingsForm, StaffTools } from "./admin-controls";
import { GMAIL_NOTICE_ID, gmailBlockedReason } from "./gmail-notice";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

async function getGmailStatus() {
  try {
    return await gmailAuthStatus();
  } catch (error) {
    console.error("Gmail status check failed", error);
    return { authorized: false as const, status: "unavailable" };
  }
}

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

  const [drafts, noteResidents, storedSettings, activeSponsorCount, sponsoredDogCount, gmail, organization] =
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
        // once a draft exists the dog moves to the approval queue below,
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
      prisma.rescueSettings.findUnique({ where: { orgId: context.orgId } }),
      prisma.sponsorship.count({ where: { orgId: context.orgId, status: "active" } }),
      prisma.resident.count({
        where: {
          orgId: context.orgId,
          sponsorships: { some: { orgId: context.orgId, status: "active" } },
        },
      }),
      getGmailStatus(),
      prisma.organization.findUnique({
        where: { id: context.orgId },
        select: {
          stripeAccountId: true,
          stripeDetailsSubmitted: true,
          stripeChargesEnabled: true,
        },
      }),
    ]);

  const settings = storedSettings ?? {
    pinnedPostscript: "",
    sourceUrl: "https://www.coppersdream.org/dogs-and-more-back-up",
  };
  const monthlyRecurring = activeSponsorCount * 25;

  return (
    <main className={`admin-shell ${styles.page}`}>
      <header className={styles.header}>
        <Link className={styles.logo} href={`/${orgSlug}`}>
          <Image alt="Pawcast" priority src={pawcastWordmark} />
        </Link>
        <div>
          <h1>Staff room</h1>
        </div>
        <div className={styles.headerActions}>
          <StaffTools
            orgSlug={orgSlug}
            initialGmail={{
              connected: gmail.authorized,
              status: gmail.status,
              ...(gmail.authorized && process.env.ARCADE_USER_ID?.includes("@")
                ? { email: process.env.ARCADE_USER_ID }
                : {}),
            }}
          />
          <SignOutButton />
        </div>
      </header>

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
          aria-label={`View dogs covered (${sponsoredDogCount} with active sponsors)`}
          className={styles.statLink}
          href={`/${orgSlug}/admin/dogs-covered`}
        >
          <AdminSurface className={styles.stat} tone="denim">
            <strong>{sponsoredDogCount}</strong>
            <span>dogs covered</span>
            <small>with at least one active sponsor</small>
          </AdminSurface>
        </Link>
        <AdminSurface className={styles.stat} tone="brick">
          <strong>92%</strong>
          <span>updates opened</span>
          <small>people love dog email</small>
        </AdminSurface>
      </section>

      <AdminSurface className={styles.settings} tone="mustard">
        <div className={styles.settingsIntro}>
          <p className={styles.eyebrow}>Stripe Connect</p>
          <h2>Monthly sponsorship payments</h2>
          <p>
            {organization?.stripeChargesEnabled
              ? "Connected and ready to accept $25 monthly sponsorships."
              : organization?.stripeDetailsSubmitted
                ? "Stripe has your details and is still enabling payments."
                : organization?.stripeAccountId
                  ? "Finish the Stripe onboarding form to accept sponsorships."
                  : "Connect this rescue to Stripe before sponsors can check out."}
          </p>
        </div>
        {!organization?.stripeChargesEnabled && context.role === "owner" && (
          <form action={beginStripeOnboarding}>
            <input name="orgSlug" type="hidden" value={orgSlug} />
            <AdminButton tone="brick" type="submit">
              {organization?.stripeAccountId ? "Continue Stripe onboarding" : "Connect Stripe"}
            </AdminButton>
          </form>
        )}
      </AdminSurface>

      <section className={styles.composeSection}>
        <div className={styles.sectionTitle}>
          <div>
            <p className={styles.eyebrow}>Volunteer notebook</p>
            <h2>Notes ready for a pupdate</h2>
          </div>
          <AdminBadge tone="mustard">
            {noteResidents.length} {noteResidents.length === 1 ? "dog" : "dogs"}
          </AdminBadge>
        </div>

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
        <div className={styles.sectionTitle}>
          <div>
            <p className={styles.eyebrow}>Approval queue</p>
            <h2>Waiting for your OK</h2>
          </div>
          <AdminBadge tone="brick">{drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</AdminBadge>
        </div>

        {!gmail.authorized && drafts.length > 0 && (
          <p className={styles.queueNotice} id={GMAIL_NOTICE_ID}>
            <span aria-hidden="true">✉️</span>
            {gmailBlockedReason(gmail.status)} Approving is on hold until then.
          </p>
        )}

        <div className={styles.queue}>
          {drafts.length === 0 ? (
            <AdminSurface className={styles.empty} tone="oatmeal">
              <span aria-hidden="true">🐾</span>
              <h3>The queue is clear</h3>
              <p>Fresh volunteer notes will become drafts here.</p>
            </AdminSurface>
          ) : (
            drafts.map((draft) => (
              <AdminSurface className={styles.queueItem} key={draft.id} tone="oatmeal">
                <PhotoPatch
                  alt={`${draft.resident.name} portrait`}
                  className={styles.photo}
                  src={draft.resident.photoUrls[0]}
                />
                <div className={styles.dogSummary}>
                  <AdminBadge tone={draft.type === "graduation" ? "mustard" : "denim"}>
                    {draft.type}
                  </AdminBadge>
                  <h3>{draft.resident.name}</h3>
                  <p>{draft.resident.personality}</p>
                  <small>goes to {draft.resident.sponsorships.length} sponsors</small>
                </div>
                <DraftEditor
                  bodyText={draft.bodyText}
                  gmailConnected={gmail.authorized}
                  gmailStatus={gmail.status}
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

      <AdminSurface className={styles.settings} tone="denim">
        <div className={styles.settingsIntro}>
          <p className={styles.eyebrowLight}>Staff settings</p>
          <h2>Pinned to every email this month</h2>
          <p>
            The postscript rides at the bottom of each pupdate. The source URL tells Sync now where
            to look for the current adoption roster.
          </p>
        </div>
        <SettingsForm orgSlug={orgSlug} pinnedPostscript={settings.pinnedPostscript} sourceUrl={settings.sourceUrl} />
      </AdminSurface>

      <footer className={styles.footer}>the staff room · nobody wrote a single email today</footer>
    </main>
  );
}
