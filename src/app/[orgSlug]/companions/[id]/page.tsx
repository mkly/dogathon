import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { createSponsorship } from "@/app/actions";
import { FeltButton, FeltField, FeltLink, FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { prisma } from "@/lib/prisma";
import { getPublicOrganization } from "@/lib/public-organization";
import { uuidSchema } from "@/lib/uuid";

import styles from "../../../public.module.css";

export const dynamic = "force-dynamic";

type CompanionPageProps = {
  params: Promise<{ id: string; orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const companionQuerySchema = z.object({
  error: z.string().optional().catch(undefined),
  sponsored: z.literal("1").optional().catch(undefined),
});

export default async function CompanionPage({ params, searchParams }: CompanionPageProps) {
  const { id, orgSlug } = await params;
  const query = companionQuerySchema.parse(await searchParams);
  if (!uuidSchema.safeParse(id).success) notFound();
  const organization = await getPublicOrganization(orgSlug);
  if (!organization) notFound();
  const resident = await prisma.resident.findFirst({ where: { id, orgId: organization.id } });

  if (!resident) notFound();

  const available = resident.status === "available";
  const sponsored = query.sponsored === "1" && !query.error;

  return (
    <main className={`${styles.siteShell} ${styles.detailShell}`}>
      <Link className={styles.backLink} href={`/${orgSlug}`}>← All residents</Link>

      {sponsored && (
        <FeltPanel className={`${styles.confirmation} ${styles.confirmationTop}`} tone="moss">
          <StitchBadge tone="cream">You&apos;re a hero!</StitchBadge>
          <h2>Thank you for sponsoring {resident.name}!</h2>
          <p>Your $25 monthly sponsorship is active until {resident.name} is adopted.</p>
          <FeltLink className={styles.cardLink} href="/account/sign-in">
            Create your sponsor account
          </FeltLink>
        </FeltPanel>
      )}

      <section className={styles.profile}>
        <div className={styles.gallery}>
          {resident.photoUrls.length ? resident.photoUrls.slice(0, 3).map((photo, index) => (
            <PhotoPatch
              alt={`${resident.name}${index ? `, photo ${index + 1}` : ""}`}
              className={index === 0 ? styles.heroPhoto : styles.extraPhoto}
              key={photo}
              src={photo}
            />
          )) : <PhotoPatch alt={resident.name} className={styles.heroPhoto} />}
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

      {available && !sponsored ? (
        <FeltPanel className={styles.sponsorPanel} tone="oatmeal">
          <div className={styles.sponsorPitch}>
            <p className={styles.eyebrow}>A steady paw</p>
            <h2>Sponsor {resident.name} for $25/month until adopted</h2>
            <p>We&apos;ll send little email updates from the rescue as {resident.name} settles in.</p>
          </div>

          {query.error && (
            <p className={styles.formError} role="alert">
              {query.error === "unavailable"
                ? `${resident.name} is no longer available to sponsor.`
                : query.error === "billing"
                  ? "Online sponsorship is not ready for this rescue yet. Please try again later."
                  : "Please complete the required fields."}
            </p>
          )}

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

            <FeltButton className={styles.sponsorButton} tone="mustard" type="submit">
              Sponsor for $25/month until adopted
            </FeltButton>
          </form>
        </FeltPanel>
      ) : !available ? (
        <FeltPanel className={styles.confirmation} tone="brick">
          <h2>{resident.name} has been adopted!</h2>
          <p>Their sponsorship chapter is complete. Meet another resident who could use your help.</p>
          <FeltLink className={styles.cardLink} href={`/${orgSlug}`} tone="cream">
            Meet the companions
          </FeltLink>
        </FeltPanel>
      ) : null}
    </main>
  );
}
