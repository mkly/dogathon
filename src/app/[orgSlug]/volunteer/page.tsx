import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AdminEmptyState, AdminHeader, AdminPage } from "@/components/admin-ui";
import { FeltButton, FeltField, FeltLink, FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { prisma } from "@/lib/prisma";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";

import { submitVolunteerNote } from "./actions";
import { volunteerErrorMessage } from "./errors";
import styles from "./volunteer.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer check-in | Dogathon",
  description: "Share a quick photo or care note for a rescue companion.",
};

type VolunteerPageProps = {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{
    companion?: string;
    error?: string;
    submitted?: string;
  }>;
};

export default async function VolunteerPage({ params, searchParams }: VolunteerPageProps) {
  const { orgSlug } = await params;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug);
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/volunteer`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  const [{ companion, error, submitted }, residents] = await Promise.all([
    searchParams,
    prisma.resident.findMany({
      where: {
        orgId: context.orgId,
        status: "available",
        sponsorships: { some: { orgId: context.orgId, status: "active" } },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrls: true },
    }),
  ]);

  const submittedCompanion = residents.find((resident) => resident.id === companion);
  const errorMessage = volunteerErrorMessage(error);

  if (submitted === "1") {
    return (
      <AdminPage variant="volunteer">
        <FeltPanel className={styles.confirmation} tone="moss">
          <StitchBadge tone="cream">Note tucked in</StitchBadge>
          <div aria-hidden="true" className={styles.confirmationMark}>✓</div>
          <h1>Thanks for the pup-date!</h1>
          <p>
            {submittedCompanion
              ? `${submittedCompanion.name}’s care team can see your note now.`
              : "The care team can see your note now."}
          </p>
          <FeltLink className={styles.againLink} href={`/${orgSlug}/volunteer`}>
            Submit another
          </FeltLink>
        </FeltPanel>
      </AdminPage>
    );
  }

  return (
    <AdminPage variant="volunteer">
      <section className={styles.shell}>
        <AdminHeader
          eyebrow={<StitchBadge tone="denim">Volunteer check-in</StitchBadge>}
          lede="Three quick steps, made for the phone in your pocket."
          title="How’s a pup doing?"
          variant="volunteer"
        />

        <form action={submitVolunteerNote} className={styles.form}>
          <input name="orgSlug" type="hidden" value={orgSlug} />
          <fieldset className={styles.fieldset}>
            <legend>1. Pick a companion</legend>
            {residents.length > 0 ? (
              <div className={styles.companionGrid}>
                {residents.map((resident, index) => (
                  <label className={styles.companionChoice} key={resident.id}>
                    <input
                      defaultChecked={index === 0}
                      name="residentId"
                      required
                      type="radio"
                      value={resident.id}
                    />
                    <FeltPanel className={styles.companionCard} stitched={false} tone="oatmeal">
                      <PhotoPatch
                        alt={resident.name}
                        className={styles.photo}
                        src={resident.photoUrls[0]}
                      />
                      <span className={styles.companionName}>
                        <span aria-hidden="true" className={styles.pickMark}>✓</span>
                        <strong>{resident.name}</strong>
                      </span>
                    </FeltPanel>
                  </label>
                ))}
              </div>
            ) : (
              <FeltPanel tone="oatmeal">
                <AdminEmptyState variant="volunteer">
                  No companions have active sponsors right now, so there’s no one to send a pup-date to yet.
                </AdminEmptyState>
              </FeltPanel>
            )}
          </fieldset>

          <FeltPanel className={styles.notePanel} tone="denim">
            <label className={styles.inputLabel} htmlFor="note">
              2. Add one quick note
            </label>
            <FeltField className={styles.noteField}>
              <textarea
                id="note"
                maxLength={240}
                name="note"
                placeholder="Vet visit went well!"
                required
                rows={3}
              />
            </FeltField>

            <label className={styles.inputLabel} htmlFor="photo">
              3. Add a photo <span>(optional)</span>
            </label>
            <FeltField className={`${styles.noteField} ${styles.photoField}`}>
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
    </AdminPage>
  );
}
