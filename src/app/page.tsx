import Link from "next/link";

import { FeltPanel, PhotoPatch, StitchBadge } from "@/components/felt";
import { prisma } from "@/lib/prisma";

import styles from "./public.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const residents = await prisma.resident.findMany({
    where: { status: "available" },
    orderBy: { name: "asc" },
  });

  return (
    <main className={styles.siteShell}>
      <FeltPanel className={styles.hero} tone="moss">
        <p className={styles.eyebrow}>Copper&apos;s Dream Dogathon</p>
        <h1>
          Put a little love behind a <span className="felt-hl">rescue dog</span>.
        </h1>
        <p className={styles.lede}>
          Sponsor a resident for $25 a month until they&apos;re adopted. You&apos;ll
          help with everyday care and get the good news from their journey.
        </p>
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
                <StitchBadge tone="oatmeal">Available</StitchBadge>
                <h2>{resident.name}</h2>
                <p>{resident.breed} · {resident.ageText}</p>
                <Link className={`felt-button felt-brick ${styles.cardLink}`} href={`/dogs/${resident.id}`}>
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
    </main>
  );
}
