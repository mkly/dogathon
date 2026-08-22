import Link from "next/link";

import { FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { prisma } from "@/lib/prisma";

import { ApproveButton, SettingsForm, StaffTools } from "./admin-controls";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [drafts, storedSettings, activeSponsorCount, sponsoredDogCount] = await Promise.all([
    prisma.pupdate.findMany({
      where: { status: "draft" },
      orderBy: { createdAt: "asc" },
      include: {
        resident: {
          include: {
            sponsorships: { where: { status: "active" }, select: { id: true } },
          },
        },
      },
    }),
    prisma.rescueSettings.findUnique({ where: { id: "default" } }),
    prisma.sponsorship.count({ where: { status: "active" } }),
    prisma.resident.count({ where: { sponsorships: { some: { status: "active" } } } }),
  ]);

  const settings = storedSettings ?? {
    pinnedPostscript: "",
    sourceUrl: "https://www.coppersdream.org/dogs-and-more-back-up",
  };
  const monthlyRecurring = activeSponsorCount * 25;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={`${styles.logo} felt-brick`} href="/">
          Sirius
        </Link>
        <div>
          <p className={styles.eyebrow}>Copper&apos;s Dream Rescue</p>
          <h1>Staff room</h1>
        </div>
        <StaffTools />
      </header>

      <section aria-label="Program statistics" className={styles.stats}>
        <FeltPanel className={styles.stat} tone="mustard">
          <strong>${monthlyRecurring.toLocaleString()}</strong>
          <span>a month, recurring</span>
          <small>active sponsorships × $25</small>
        </FeltPanel>
        <FeltPanel className={styles.stat} tone="moss">
          <strong>{activeSponsorCount}</strong>
          <span>active sponsors</span>
          <small>ready for the next pupdate</small>
        </FeltPanel>
        <FeltPanel className={styles.stat} tone="denim">
          <strong>{sponsoredDogCount}</strong>
          <span>dogs covered</span>
          <small>with at least one active sponsor</small>
        </FeltPanel>
        <FeltPanel className={styles.stat} tone="brick">
          <strong>92%</strong>
          <span>updates opened</span>
          <small>people love dog email</small>
        </FeltPanel>
      </section>

      <section className={styles.queueSection}>
        <div className={styles.sectionTitle}>
          <div>
            <p className={styles.eyebrow}>Approval queue</p>
            <h2>Waiting for your OK</h2>
          </div>
          <StitchBadge tone="brick">{drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</StitchBadge>
        </div>

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
                <article className={styles.draftPreview}>
                  <strong>{draft.subject}</strong>
                  <p>{draft.bodyText}</p>
                  {settings.pinnedPostscript && <small>P.S. {settings.pinnedPostscript}</small>}
                </article>
                <ApproveButton id={draft.id} />
              </FeltPanel>
            ))
          )}
        </div>
      </section>

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
