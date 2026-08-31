import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FeltPanel, PhotoPatch } from "@/components/felt";
import { prisma } from "@/lib/prisma";
import { getPublicOrganization } from "@/lib/public-organization";

import pawcastWordmark from "../../../public/brand/pawcast-wordmark.png";
import feltPup from "../../../public/mascot/felt-pup-2.png";

import styles from "../public.module.css";

export const dynamic = "force-dynamic";

type OrganizationHomeProps = { params: Promise<{ orgSlug: string }> };

export default async function OrganizationHome({ params }: OrganizationHomeProps) {
  const { orgSlug } = await params;
  const organization = await getPublicOrganization(orgSlug);
  if (!organization) notFound();
  const residents = await prisma.resident.findMany({
    where: { orgId: organization.id, status: "available" },
    orderBy: { name: "asc" },
  });

  return (
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
        <section aria-label="Dogs available to sponsor" className={styles.dogGrid}>
          {residents.map((resident) => (
            <FeltPanel className={styles.dogCard} key={resident.id} tone="oatmeal">
              <PhotoPatch
                alt={`${resident.name}, ${resident.breed}`}
                className={styles.gridPhoto}
                src={resident.photoUrls[0]}
              />
              <div className={styles.cardCopy}>
                <span className={styles.cardStatus}>Available</span>
                <h2>{resident.name}</h2>
                <p>{resident.breed} · {resident.ageText}</p>
                <Link className={`felt-button felt-brick ${styles.cardLink}`} href={`/${orgSlug}/dogs/${resident.id}`}>
                  Meet {resident.name}
                </Link>
              </div>
            </FeltPanel>
          ))}
        </section>
      ) : (
        <FeltPanel className={styles.emptyState} tone="oatmeal">
          <h2>Every dog is tucked in for now.</h2>
          <p>Check back soon to meet the next residents looking for a sponsor.</p>
        </FeltPanel>
      )}

      <footer className={styles.footer}>
        <Link href={`/${orgSlug}/admin`}>staff room</Link>
      </footer>
    </main>
  );
}
