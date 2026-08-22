import type { Metadata } from "next";
import Link from "next/link";

import { FeltButton, FeltField, FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { prisma } from "@/lib/prisma";

import { submitVolunteerNote } from "./actions";
import { volunteerErrorMessage } from "./errors";
import styles from "./volunteer.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer check-in | Dogathon",
  description: "Share a quick photo or care note for a rescue dog.",
};

type VolunteerPageProps = {
  searchParams: Promise<{
    dog?: string;
    error?: string;
    submitted?: string;
  }>;
};

export default async function VolunteerPage({ searchParams }: VolunteerPageProps) {
  const [{ dog, error, submitted }, residents] = await Promise.all([
    searchParams,
    prisma.resident.findMany({
      where: { status: "available", sponsorships: { some: { status: "active" } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrls: true },
    }),
  ]);

  const submittedDog = residents.find((resident) => resident.id === dog);
  const errorMessage = volunteerErrorMessage(error);

  if (submitted === "1") {
    return (
      <main className={styles.main}>
        <FeltPanel className={styles.confirmation} tone="moss">
          <StitchBadge tone="cream">Note tucked in</StitchBadge>
          <div aria-hidden="true" className={styles.confirmationMark}>✓</div>
          <h1>Thanks for the pup-date!</h1>
          <p>
            {submittedDog
              ? `${submittedDog.name}’s care team can see your note now.`
              : "The care team can see your note now."}
          </p>
          <Link className={`felt-button felt-mustard ${styles.againLink}`} href="/volunteer">
            Submit another
          </Link>
        </FeltPanel>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <StitchBadge tone="denim">Volunteer check-in</StitchBadge>
          <h1>How’s a pup doing?</h1>
          <p>Pick a dog, share one quick note, and add a photo if you have one.</p>
        </header>

        <form action={submitVolunteerNote} className={styles.form}>
          <fieldset className={styles.fieldset}>
            <legend>1. Pick a dog</legend>
            {residents.length > 0 ? (
              <div className={styles.dogGrid}>
                {residents.map((resident, index) => (
                  <label className={styles.dogChoice} key={resident.id}>
                    <input
                      defaultChecked={index === 0}
                      name="residentId"
                      required
                      type="radio"
                      value={resident.id}
                    />
                    <FeltPanel className={styles.dogCard} stitched={false} tone="oatmeal">
                      <PhotoPatch
                        alt={resident.name}
                        className={styles.photo}
                        src={resident.photoUrls[0]}
                      />
                      <strong>{resident.name}</strong>
                    </FeltPanel>
                  </label>
                ))}
              </div>
            ) : (
              <FeltPanel className={styles.empty} tone="oatmeal">
                No dogs have active sponsors right now, so there’s no one to send a pup-date to yet.
              </FeltPanel>
            )}
          </fieldset>

          <FeltPanel className={styles.notePanel} tone="denim">
            <label className={styles.inputLabel} htmlFor="note">
              2. Add one quick note
            </label>
            <FeltField>
              <input
                id="note"
                maxLength={240}
                name="note"
                placeholder="Vet visit went well!"
                required
                type="text"
              />
            </FeltField>

            <label className={styles.inputLabel} htmlFor="photo">
              Photo <span>(optional)</span>
            </label>
            <FeltField className={styles.photoField}>
              <input
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                capture="environment"
                id="photo"
                name="photo"
                type="file"
              />
            </FeltField>
            <small>Take one now or choose one from your phone. Max 8 MB.</small>
          </FeltPanel>

          {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}

          <FeltButton className={styles.submit} disabled={residents.length === 0} tone="brick" type="submit">
            Send pup-date
          </FeltButton>
        </form>
      </section>
    </main>
  );
}
