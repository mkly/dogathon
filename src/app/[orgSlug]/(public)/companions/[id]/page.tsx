import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";

import { createSponsorship } from "@/app/actions";
import { FeltField, FeltLink, FeltPanel, PhotoPatch, Stitch, StitchBadge } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { formatMonthlyAmount } from "@/lib/format";
import {
  getPublicCompanionParams,
  getPublicOrganization,
  getPublicResident,
} from "@/lib/public-roster-cache";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS } from "@/lib/rescue-settings";
import { uuidSchema } from "@/lib/uuid";

import { CompanionBanner, CompanionFormError, CompanionSponsorState } from "./companion-banner";
import { companionFacts, sponsorshipSucceeded } from "./companion-page";
import { SponsorSubmitButton } from "./sponsor-submit-button";
import styles from "../../../../public.module.css";

export const revalidate = 86400;

type CompanionPageProps = {
  params: Promise<{ id: string; orgSlug: string }>;
  searchParams: Promise<{ error?: string | string[]; sponsored?: string | string[] }>;
};

export async function generateStaticParams() {
  const companions = await getPublicCompanionParams();
  return companions.map(({ id, organization }) => ({ id, orgSlug: organization.slug }));
}

export default async function CompanionPage({ params, searchParams }: CompanionPageProps) {
  const { id, orgSlug } = await params;
  const sponsored = sponsorshipSucceeded(await searchParams);
  if (!uuidSchema.safeParse(id).success) notFound();
  const organization = await getPublicOrganization(orgSlug);
  if (!organization) notFound();
  const resident = await getPublicResident(organization.id, id);

  if (!resident) notFound();

  const available = resident.status === "available";
  const tiers = organization.sponsorshipTiers;
  const firstTier = tiers[0];
  const defaultTier = tiers.find((tier) => "isDefault" in tier && tier.isDefault === true) ?? firstTier;
  // An organization that has never saved its sponsorship settings has no tiers, and checkout
  // falls back to the default price, so the page shows that price and posts no tier at all.
  const monthlyAmount = formatMonthlyAmount(defaultTier?.monthlyCents ?? DEFAULT_SPONSORSHIP_MONTHLY_CENTS);
  return (
    <PageViewTransition>
      <main className={`${styles.siteShell} ${styles.detailShell}`}>
        <Link className={styles.backLink} href={`/${orgSlug}`} transitionTypes={["nav-back"]}>← All residents</Link>

        <Suspense fallback={null}>
          <CompanionBanner name={resident.name} />
        </Suspense>

        <section className={styles.profile}>
          <div className={styles.gallery}>
            {resident.photoUrls.length ? resident.photoUrls.slice(0, 3).map((photo, index) => (
              index === 0 ? (
                <ViewTransition
                  default="none"
                  key={photo}
                  name={`companion-${resident.id}`}
                  share="companion-photo"
                >
                  <PhotoPatch
                    alt={resident.name}
                    className={styles.heroPhoto}
                    preload
                    sizes="(max-width: 700px) calc(100vw - 48px), 22rem"
                    src={photo}
                  />
                </ViewTransition>
              ) : (
                <PhotoPatch
                  alt={`${resident.name}, photo ${index + 1}`}
                  className={styles.extraPhoto}
                  key={photo}
                  sizes="(max-width: 700px) calc(100vw - 48px), 22rem"
                  src={photo}
                />
              )
            )) : (
              <ViewTransition
                default="none"
                name={`companion-${resident.id}`}
                share="companion-photo"
              >
                <PhotoPatch alt={resident.name} className={styles.heroPhoto} />
              </ViewTransition>
            )}
          </div>

          <div className={styles.profileCopy}>
            <StitchBadge tone={available ? "moss" : "brick"}>
              {available ? "Available" : "Adopted"}
            </StitchBadge>
            <h1>{resident.name}</h1>
            <p className={styles.companionFacts}>
              {companionFacts(resident)}
            </p>
            <p className={styles.personality}>{resident.personality}</p>

            {resident.dobText && <p><strong>Date of birth:</strong> {resident.dobText}</p>}
            {resident.careNotes.length > 0 && (
              <div>
                <h2>Care notes</h2>
                <ul className={styles.careList}>
                  {resident.careNotes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>

        {available ? (
          <CompanionSponsorState sponsored={sponsored}>
            <FeltPanel className={styles.sponsorPanel} tone="oatmeal">
              <div className={styles.sponsorPitch}>
                <p className={styles.eyebrow}>Monthly sponsorship</p>
                <h2>
                  {tiers.length < 2
                    ? `Cover ${resident.name}'s care for ${monthlyAmount} a month`
                    : `Help cover ${resident.name}'s care every month`}
                </h2>
                <p>
                  Your gift goes toward food, vet visits, and a warm bed while {resident.name} waits
                  for a home. You&apos;ll get updates from the rescue along the way, and your
                  sponsorship ends the day {resident.name} is adopted.
                </p>
              </div>

              <Suspense fallback={null}><CompanionFormError name={resident.name} /></Suspense>

              <form action={createSponsorship} className={styles.sponsorForm}>
                <input name="orgSlug" type="hidden" value={orgSlug} />
                <input name="residentId" type="hidden" value={resident.id} />

                {tiers.length < 2 ? (
                  defaultTier ? (
                    <div className={styles.singleTier}>
                      <input name="tier" type="hidden" value={defaultTier.id} />
                      <p>{defaultTier.description}</p>
                    </div>
                  ) : null
                ) : (
                  <fieldset className={styles.sponsorshipTiers}>
                    <legend>Pick a monthly amount</legend>
                    {tiers.map((tier) => (
                      <label className={styles.sponsorshipTier} key={tier.id}>
                        <input defaultChecked={tier.id === defaultTier?.id} name="tier" required type="radio" value={tier.id} />
                        <Stitch fine />
                        <span>
                          <strong>{formatMonthlyAmount(tier.monthlyCents)}/month</strong>
                          <small>{tier.description}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}

                <label htmlFor="sponsorName">Your name</label>
                <FeltField>
                  <input autoComplete="name" id="sponsorName" name="sponsorName" required />
                </FeltField>

                <label htmlFor="sponsorEmail">Email</label>
                <FeltField>
                  <input autoComplete="email" id="sponsorEmail" name="sponsorEmail" required type="email" />
                </FeltField>

                <SponsorSubmitButton className={styles.sponsorButton} pendingLabel="Opening checkout…" tone="mustard" type="submit">
                  Continue to checkout
                </SponsorSubmitButton>
              </form>
            </FeltPanel>
          </CompanionSponsorState>
        ) : (
          <FeltPanel className={styles.confirmation} tone="brick">
            <h2>{resident.name} has found a home</h2>
            <p>Sponsorships for {resident.name} have ended. Another resident is still waiting for one.</p>
            <FeltLink
              className={styles.cardLink}
              href={`/${orgSlug}`}
              tone="cream"
              transitionTypes={["nav-back"]}
            >
              Meet the companions
            </FeltLink>
          </FeltPanel>
        )}
      </main>
    </PageViewTransition>
  );
}
