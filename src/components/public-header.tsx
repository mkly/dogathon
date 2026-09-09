import Image from "next/image";
import Link from "next/link";

import { Stitch, StitchBadge } from "@/components/felt";

import pawcastWordmark from "../../public/brand/pawcast-wordmark.png";

import styles from "./public-header.module.css";

type PublicHeaderProps = {
  organizationName: string;
  orgSlug: string;
};

/** Wordmark plus the rescue this roster belongs to, shared by the public pages. */
export function PublicHeader({ organizationName, orgSlug }: PublicHeaderProps) {
  return (
    <header className={styles.header}>
      <Link className={styles.home} href={`/${orgSlug}`}>
        <Image
          alt="Pawcast"
          className={styles.wordmark}
          src={pawcastWordmark}
        />
      </Link>
      <StitchBadge className={styles.rescue} tone="cream">
        <Stitch fine />
        {organizationName}
      </StitchBadge>
    </header>
  );
}
