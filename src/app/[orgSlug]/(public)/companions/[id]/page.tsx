import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";

import { createSponsorship } from "@/app/actions";
import { FeltField, FeltLink, FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { PendingFeltSubmitButton } from "@/components/pending-submit-button";
import {
  getPublicCompanionParams,
  getPublicOrganization,
  getPublicResident,
} from "@/lib/public-roster-cache";
import { SPONSORSHIP_MONTHLY_USD } from "@/lib/sponsorship-pricing";
import { uuidSchema } from "@/lib/uuid";

import { CompanionBanner, CompanionFormError, CompanionSponsorState } from "./companion-banner";
import styles from "../../../../public.module.css";

export const revalidate = 86400;

type CompanionPageProps = {
  params: Promise<{ id: string; orgSlug: string }>;
};

export async function generateStaticParams() {
  const companions = await getPublicCompanionParams();
  return companions.map(({ id, organization }) => ({ id, orgSlug: organization.slug }));
}

export default async function CompanionPage({ params }: CompanionPageProps) {
  const { id, orgSlug } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const organization = await getPublicOrganization(orgSlug);
  if (!organization) notFound();
  const resident = await getPublicResident(organization.id, id);

  if (!resident) notFound();

  const available = resident.status === "available";
  return (
    <PageViewTransition>
      <main className={`${styles.siteShell} ${styles.detailShell}`}>
        <Link className={styles.backLink} href={`/${orgSlug}`} transitionTypes={["nav-back"]}>← All residents</Link>

        <Suspense fallback={null}><CompanionBanner name={resident.name} /></Suspense>

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
              {resident.breed} · {resident.sex} · {resident.ageText} · {resident.weightText}
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
          <CompanionSponsorState>
            <FeltPanel className={styles.sponsorPanel} tone="oatmeal">
              <div className={styles.sponsorPitch}>
                <p className={styles.eyebrow}>A steady paw</p>
                <h2>
                  Sponsor {resident.name} for ${SPONSORSHIP_MONTHLY_USD}/month until adopted
                </h2>
                <p>We&apos;ll send little email updates from the rescue as {resident.name} settles in.</p>
              </div>

              <Suspense fallback={null}><CompanionFormError name={resident.name} /></Suspense>

              <form action={createSponsorship} className={styles.sponsorForm}>
                <input name="orgSlug" type="hidden" value={orgSlug} />
                <input name="residentId" type="hidden" value={resident.id} />

                <label htmlFor="sponsorName">Your name</label>
                <FeltField>
                  <input autoComplete="name" id="sponsorName" name="sponsorName" required />
                </FeltField>

                <label htmlFor="sponsorEmail">Email</label>
                <FeltField>
                  <input autoComplete="email" id="sponsorEmail" name="sponsorEmail" required type="email" />
                </FeltField>

                <PendingFeltSubmitButton className={styles.sponsorButton} pendingLabel="Opening checkout…" tone="mustard" type="submit">
                  Sponsor for ${SPONSORSHIP_MONTHLY_USD}/month until adopted
                </PendingFeltSubmitButton>
              </form>
            </FeltPanel>
          </CompanionSponsorState>
        ) : (
          <FeltPanel className={styles.confirmation} tone="brick">
            <h2>{resident.name} has been adopted!</h2>
            <p>Their sponsorship chapter is complete. Meet another resident who could use your help.</p>
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
