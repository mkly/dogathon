import Image from "next/image";

import { FeltPanel, PhotoPatch } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { PendingFeltSubmitButton } from "@/components/pending-submit-button";
import { env } from "@/lib/env";
import { formatMonthlyAmount } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { verifySponsorshipSelectionToken } from "@/lib/sponsorship-selection-token";

import pawcastWordmark from "../../../../../../public/brand/pawcast-wordmark.png";
import styles from "../../../../public.module.css";
import { endSponsorshipAction, transferSponsorshipAction } from "./actions";

type NextCompanionPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ error?: string | string[]; token?: string | string[] }>;
};

function Notice({ children }: { children: React.ReactNode }) {
  return <FeltPanel className={styles.selectionNotice} tone="oatmeal">{children}</FeltPanel>;
}

export default async function NextCompanionPage({ params, searchParams }: NextCompanionPageProps) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const verified = env.BETTER_AUTH_SECRET
    ? verifySponsorshipSelectionToken(token, env.BETTER_AUTH_SECRET)
    : null;
  const sponsorship = verified ? await prisma.sponsorship.findFirst({
    where: { id: verified.sponsorshipId, organization: { slug: orgSlug } },
    include: {
      organization: { select: { id: true, name: true } },
      resident: { select: { name: true } },
    },
  }) : null;

  const residents = sponsorship?.status === "awaiting" ? await prisma.resident.findMany({
    where: {
      orgId: sponsorship.orgId,
      available: true,
      sponsorships: { none: { status: "active" } },
    },
    orderBy: { name: "asc" },
  }) : [];

  return (
    <PageViewTransition>
      <main className={styles.siteShell}>
        <Image alt="Pawcast" className={styles.wordmark} src={pawcastWordmark} />
        {!sponsorship ? (
          <Notice>
            <h1>This link no longer applies</h1>
            <p>It may have expired, or this sponsorship may already have been updated. No changes were made.</p>
          </Notice>
        ) : sponsorship.status === "active" ? (
          <Notice>
            <h1>You&apos;re now sponsoring {sponsorship.resident.name}</h1>
            <p>Your {formatMonthlyAmount(sponsorship.monthlyCents)} monthly sponsorship is active again. We sent a confirmation to your email.</p>
          </Notice>
        ) : sponsorship.status === "ended" ? (
          <Notice>
            <h1>Thank you for sponsoring</h1>
            <p>Your sponsorship has ended, and no more charges will be made. We sent a short confirmation to your email.</p>
          </Notice>
        ) : (
          <>
            <FeltPanel className={styles.selectionHero} tone="moss">
              <h1>Choose your next companion</h1>
              <p>Your monthly amount stays the same. Pick one available companion and we&apos;ll resume your existing sponsorship.</p>
              {query.error === "resident_unavailable" ? <p className={styles.formError}>That companion was just chosen. Please pick another.</p> : null}
            </FeltPanel>

            {residents.length ? (
              <section aria-label="Companions available to sponsor" className={styles.companionGrid}>
                {residents.map((resident) => (
                  <FeltPanel className={styles.companionCard} key={resident.id} stitched={false} tone="oatmeal">
                    <PhotoPatch alt={`${resident.name}, ${resident.breed}`} className={styles.gridPhoto} src={resident.photoUrls[0]} />
                    <div className={styles.cardCopy}>
                      <span className={styles.cardStatus}>Available</span>
                      <h2>{resident.name}</h2>
                      <p>{resident.breed} · {resident.ageText}</p>
                      <form action={transferSponsorshipAction.bind(null, orgSlug, token)} className={styles.selectionForm}>
                        <input name="residentId" type="hidden" value={resident.id} />
                        <PendingFeltSubmitButton pendingLabel="Moving sponsorship…" tone="brick" type="submit">
                          Sponsor {resident.name}
                        </PendingFeltSubmitButton>
                      </form>
                    </div>
                  </FeltPanel>
                ))}
              </section>
            ) : <Notice><h2>No companions are available right now</h2><p>Please check this page again soon.</p></Notice>}

            <FeltPanel className={styles.stopSponsoring} tone="cream">
              <div><h2>Prefer to stop?</h2><p>You can end this sponsorship and cancel its recurring charge.</p></div>
              <form action={endSponsorshipAction.bind(null, orgSlug, token)}>
                <PendingFeltSubmitButton pendingLabel="Ending sponsorship…" tone="oatmeal" type="submit">Stop sponsoring</PendingFeltSubmitButton>
              </form>
            </FeltPanel>
          </>
        )}
      </main>
    </PageViewTransition>
  );
}
