import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { SignOutButton } from "@/components/sign-out-button";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { getOrganizationContext } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

import pawcastWordmark from "../../../public/brand/pawcast-wordmark.png";

import {
  ComposeButton,
  DraftEditor,
  EmailConnectorSettings,
  SettingsForm,
  StaffTools,
} from "./admin-controls";
import { EMAIL_CONNECTOR_NOTICE_ID, emailConnectorBlockedReason } from "./gmail-notice";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const context = await getOrganizationContext(await headers(), ["owner", "admin"]);

  if (!context) {
    redirect("/organizations");
  }

  const [drafts, noteResidents, storedSettings, activeSponsorCount, sponsoredDogCount, emailConnector] =
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
      getEmailConnectorStatus(context.orgId),
    ]);

  const settings = storedSettings ?? {
    pinnedPostscript: "",
    sourceUrl: "https://www.coppersdream.org/dogs-and-more-back-up",
  };
  const monthlyRecurring = activeSponsorCount * 25;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.logo} href="/">
          <Image alt="Pawcast" priority src={pawcastWordmark} />
        </Link>
        <div>
          <h1>Staff room</h1>
        </div>
        <div className={styles.headerActions}>
          <StaffTools />
          <SignOutButton />
        </div>
      </header>

      <section aria-label="Program statistics" className={styles.stats}>
        <FeltPanel className={styles.stat} tone="mustard">
          <strong>${monthlyRecurring.toLocaleString()}</strong>
          <span>a month, recurring</span>
          <small>active sponsorships × $25</small>
        </FeltPanel>
        <Link
          aria-label={`View active sponsors (${activeSponsorCount} active)`}
          className={styles.statLink}
          href="/admin/sponsors"
        >
          <FeltPanel className={styles.stat} tone="moss">
            <strong>{activeSponsorCount}</strong>
            <span>active sponsors</span>
            <small>ready for the next pupdate</small>
          </FeltPanel>
        </Link>
        <Link
          aria-label={`View dogs covered (${sponsoredDogCount} with active sponsors)`}
          className={styles.statLink}
          href="/admin/dogs-covered"
        >
          <FeltPanel className={styles.stat} tone="denim">
            <strong>{sponsoredDogCount}</strong>
            <span>dogs covered</span>
            <small>with at least one active sponsor</small>
          </FeltPanel>
        </Link>
        <FeltPanel className={styles.stat} tone="brick">
          <strong>92%</strong>
          <span>updates opened</span>
          <small>people love dog email</small>
        </FeltPanel>
      </section>

      <section className={styles.composeSection}>
        <div className={styles.sectionTitle}>
          <div>
            <p className={styles.eyebrow}>Volunteer notebook</p>
            <h2>Notes ready for a pupdate</h2>
          </div>
          <StitchBadge tone="mustard">
            {noteResidents.length} {noteResidents.length === 1 ? "dog" : "dogs"}
          </StitchBadge>
        </div>

        {noteResidents.length === 0 ? (
          <FeltPanel className={styles.composeEmpty} tone="oatmeal">
            No volunteer notes are waiting yet.
          </FeltPanel>
        ) : (
          <div className={styles.composeGrid}>
            {noteResidents.map((resident) => {
              const latestNote = resident.volunteerNotes[0]?.createdAt;

              return (
                <FeltPanel className={styles.composeItem} key={resident.id} tone="oatmeal">
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
                  <ComposeButton residentId={resident.id} residentName={resident.name} />
                </FeltPanel>
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
          <StitchBadge tone="brick">{drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</StitchBadge>
        </div>

        {!emailConnector.connected && drafts.length > 0 && (
          <p className={styles.queueNotice} id={EMAIL_CONNECTOR_NOTICE_ID}>
            <span aria-hidden="true">✉️</span>
            {emailConnectorBlockedReason()} Approving is on hold until then.
          </p>
        )}

        <div className={styles.queue}>
          {drafts.length === 0 ? (
            <FeltPanel className={styles.empty} tone="oatmeal">
              <span aria-hidden="true">🐾</span>
              <h3>The queue is clear</h3>
              <p>Fresh volunteer notes will become drafts here.</p>
            </FeltPanel>
          ) : (
            drafts.map((draft) => (
              <FeltPanel className={styles.queueItem} key={draft.id} tone="oatmeal">
                <PhotoPatch
                  alt={`${draft.resident.name} portrait`}
                  className={styles.photo}
                  src={draft.resident.photoUrls[0]}
                />
                <div className={styles.dogSummary}>
                  <StitchBadge tone={draft.type === "graduation" ? "mustard" : "denim"}>
                    {draft.type}
                  </StitchBadge>
                  <h3>{draft.resident.name}</h3>
                  <p>{draft.resident.personality}</p>
                  <small>goes to {draft.resident.sponsorships.length} sponsors</small>
                </div>
                <DraftEditor
                  bodyText={draft.bodyText}
                  emailConnected={emailConnector.connected}
                  id={draft.id}
                  smsText={draft.smsText}
                  subject={draft.subject}
                />
              </FeltPanel>
            ))
          )}
        </div>
      </section>

      <EmailConnectorSettings initialConnector={emailConnector} />

      <FeltPanel className={styles.settings} tone="denim">
        <div className={styles.settingsIntro}>
          <p className={styles.eyebrowLight}>Staff settings</p>
          <h2>Pinned to every email this month</h2>
          <p>
            The postscript rides at the bottom of each pupdate. The source URL tells Sync now where
            to look for the current adoption roster.
          </p>
        </div>
        <SettingsForm pinnedPostscript={settings.pinnedPostscript} sourceUrl={settings.sourceUrl} />
      </FeltPanel>

      <footer className={styles.footer}>the staff room · nobody wrote a single email today</footer>
    </main>
  );
}
