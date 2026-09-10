import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ViewTransition } from "react";

import { PhotoPatch } from "@/components/felt";

import wordmark from "../../../../public/brand/pawcast-wordmark.png";

import { PhotoCharm } from "./photo-charm";
import styles from "./roster.module.css";

export type RosterResident = {
  ageText: string;
  breed: string;
  id: string;
  name: string;
  personality: string;
  photoUrls: string[];
};

type RosterShellProps = {
  children: ReactNode;
  headerAction: ReactNode;
  organizationName: string;
  orgSlug: string;
};

export function RosterShell({
  children,
  headerAction,
  organizationName,
  orgSlug,
}: RosterShellProps) {
  return (
    <main className={styles.siteShell}>
      <header className={styles.header}>
        <Link
          className={styles.homeLink}
          href={`/${orgSlug}`}
          aria-label={`${organizationName} home`}
        >
          <Image
            alt="Pawcast"
            className={styles.wordmark}
            src={wordmark}
            preload
          />
        </Link>
        <div className={styles.headerAction}>{headerAction}</div>
      </header>
      {children}
    </main>
  );
}

export function CompanionGrid({
  children,
  label = "Companions available to sponsor",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <section aria-label={label} className={styles.companionGrid}>
      {children}
    </section>
  );
}

export function CompanionCard({ children }: { children: ReactNode }) {
  return <article className={styles.companionCard}>{children}</article>;
}

export function CompanionPhoto({
  preload = false,
  resident,
}: {
  preload?: boolean;
  resident: RosterResident;
}) {
  return (
    <div className={styles.photoStage}>
      <PhotoCharm id={resident.id} />
      <ViewTransition
        default="none"
        name={`companion-${resident.id}`}
        share="companion-photo"
      >
        <PhotoPatch
          alt={`${resident.name}, ${resident.breed}`}
          className={styles.gridPhoto}
          sizes="(max-width: 640px) min(300px, calc(100vw - 80px)), (max-width: 900px) calc((90vw - 48px) / 2), (max-width: 1180px) calc((90vw - 112px) / 3), 316px"
          preload={preload}
          src={resident.photoUrls[0]}
        />
      </ViewTransition>
    </div>
  );
}

export function CompanionCardCopy({
  action,
  heading,
  resident,
}: {
  action: ReactNode;
  heading: ReactNode;
  resident: RosterResident;
}) {
  const details = [resident.breed, resident.ageText]
    .filter((detail) => detail.trim())
    .join(" · ");
  const personality = resident.personality.trim();

  return (
    <div className={styles.cardCopy}>
      <h2>{heading}</h2>
      {details ? <p>{details}</p> : null}
      {personality ? <p className={styles.personality}>{personality}</p> : null}
      <div className={styles.cardAction}>{action}</div>
    </div>
  );
}

export function StitchedArrow() {
  return (
    <svg
      className={styles.stitchedArrow}
      viewBox="0 0 36 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 13 C11 10 19 15 31 12 M23 4 L32 12 L24 20" />
    </svg>
  );
}
