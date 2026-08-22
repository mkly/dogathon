import Link from "next/link";
import { notFound } from "next/navigation";

import { createSponsorship } from "@/app/actions";
import { FeltButton, FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { prisma } from "@/lib/prisma";

import styles from "../../public.module.css";

export const dynamic = "force-dynamic";

type DogPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; sponsored?: string }>;
};

export default async function DogPage({ params, searchParams }: DogPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const resident = await prisma.resident.findUnique({ where: { id } });

  if (!resident) notFound();

  const available = resident.status === "available";
  const sponsored = query.sponsored === "1" && !query.error;

  return (
    <main className={`${styles.siteShell} ${styles.detailShell}`}>
      <Link className={styles.backLink} href="/">← All residents</Link>

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
          <p className={styles.dogFacts}>
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

      {sponsored && (
        <FeltPanel className={styles.confirmation} tone="moss">
          <StitchBadge tone="cream">You&apos;re on the team</StitchBadge>
          <h2>Thank you for sponsoring {resident.name}!</h2>
          <p>Your $25 monthly sponsorship is active until {resident.name} is adopted.</p>
        </FeltPanel>
      )}

      {available && !sponsored ? (
        <FeltPanel className={styles.sponsorPanel} tone="oatmeal">
          <div className={styles.sponsorPitch}>
            <p className={styles.eyebrow}>A steady paw</p>
            <h2>Sponsor {resident.name} for $25/month until adopted</h2>
            <p>Choose how you&apos;d like to receive little updates from the rescue.</p>
          </div>

          {query.error && (
            <p className={styles.formError} role="alert">
              {query.error === "unavailable"
                ? `${resident.name} is no longer available to sponsor.`
                : "Please complete the required fields. A phone number is required for text updates."}
            </p>
          )}

          <form action={createSponsorship} className={styles.sponsorForm}>
            <input name="residentId" type="hidden" value={resident.id} />

            <label htmlFor="sponsorName">Your name</label>
            <input autoComplete="name" id="sponsorName" name="sponsorName" required />

            <label htmlFor="sponsorEmail">Email</label>
            <input autoComplete="email" id="sponsorEmail" name="sponsorEmail" required type="email" />

            <label htmlFor="sponsorPhone">Phone <span>(optional for email updates)</span></label>
            <input autoComplete="tel" id="sponsorPhone" name="sponsorPhone" type="tel" />

            <label htmlFor="channel">Send my updates by</label>
            <select defaultValue="email" id="channel" name="channel">
              <option value="email">Email</option>
              <option value="sms">Text message</option>
              <option value="both">Email and text</option>
            </select>

            <FeltButton className={styles.sponsorButton} tone="mustard" type="submit">
              Sponsor for $25/month until adopted
            </FeltButton>
          </form>
        </FeltPanel>
      ) : !available ? (
        <FeltPanel className={styles.confirmation} tone="brick">
          <h2>{resident.name} has been adopted!</h2>
          <p>Their sponsorship chapter is complete. Meet another resident who could use your help.</p>
          <Link className={`felt-button felt-cream ${styles.cardLink}`} href="/">Meet the dogs</Link>
        </FeltPanel>
      ) : null}
    </main>
  );
}
