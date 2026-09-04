import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FeltLink, FeltPanel, PhotoPatch } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
import { ViewTransition } from "react";
import {
  getPublicOrganization,
  getPublicOrganizations,
  getPublicResidents,
} from "@/lib/public-roster-cache";

import pawcastWordmark from "../../../public/brand/pawcast-wordmark.png";
import feltPup from "../../../public/mascot/felt-pup-2.png";

import styles from "../public.module.css";

export const revalidate = 86400;

type OrganizationHomeProps = { params: Promise<{ orgSlug: string }> };

export async function generateStaticParams() {
  const organizations = await getPublicOrganizations();
  return organizations.map(({ slug }) => ({ orgSlug: slug }));
}

export default async function OrganizationHome({ params }: OrganizationHomeProps) {
  const { orgSlug } = await params;
  const organization = await getPublicOrganization(orgSlug);
  if (!organization) notFound();
  const residents = await getPublicResidents(organization.id);

  return (
    <PageViewTransition>
      <main className={styles.siteShell}>
      <Image alt="Pawcast" className={styles.wordmark} priority src={pawcastWordmark} />

      <p>{organization.name}</p>

      <FeltPanel className={styles.hero} tone="moss">
        <div className={styles.heroCopy}>
          <h1>
            Put a little love behind a{" "}
            <span className={styles.noOrphan}>
              <span className="felt-hl">rescue friend</span>.
            </span>
          </h1>
          <p className={styles.lede}>
            Sponsor a resident for $25 a month until they find their forever home. You&apos;ll
            help with everyday care and get the good news from their journey.
          </p>
        </div>
        {/* decorative: the heading and lede already carry the meaning */}
        <Image alt="" className={styles.mascot} priority src={feltPup} />
      </FeltPanel>

      {residents.length ? (
        <section aria-label="Companions available to sponsor" className={styles.companionGrid}>
          {residents.map((resident) => (
            <FeltPanel className={styles.companionCard} key={resident.id} tone="oatmeal">
              <ViewTransition
                default="none"
                name={`companion-${resident.id}`}
                share="companion-photo"
              >
                <PhotoPatch
                  alt={`${resident.name}, ${resident.breed}`}
                  className={styles.gridPhoto}
                  src={resident.photoUrls[0]}
                />
              </ViewTransition>
              <div className={styles.cardCopy}>
                <span className={styles.cardStatus}>Available</span>
                <h2>{resident.name}</h2>
                <p>{resident.breed} · {resident.ageText}</p>
                <FeltLink
                  className={styles.cardLink}
                  href={`/${orgSlug}/companions/${resident.id}`}
                  tone="brick"
                >
                  Meet {resident.name}
                </FeltLink>
              </div>
            </FeltPanel>
          ))}
        </section>
      ) : (
        <FeltPanel className={styles.emptyState} tone="oatmeal">
          <h2>Every companion is tucked in for now.</h2>
          <p>Check back soon to meet the next residents looking for a sponsor.</p>
        </FeltPanel>
      )}

      <footer className={styles.footer}>
        <Link href={`/${orgSlug}/admin`} transitionTypes={["nav-forward"]}>staff room</Link>
      </footer>
      </main>
    </PageViewTransition>
  );
}
