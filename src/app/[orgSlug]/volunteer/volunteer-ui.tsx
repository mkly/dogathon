import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

import { AdminButton, type AdminButtonProps } from "@/components/admin-ui";
import pawcastWordmark from "../../../../public/brand/pawcast-wordmark.png";
import styles from "./volunteer.module.css";

export function VolunteerButton({
  className,
  tone = "denim",
  ...props
}: AdminButtonProps) {
  return (
    <AdminButton
      className={clsx(
        styles.action,
        (tone === "cream" || tone === "oatmeal") && styles.secondaryAction,
        tone === "brick" && styles.dangerAction,
        tone === "moss" && styles.greenAction,
        className,
      )}
      tone={tone}
      {...props}
    />
  );
}

export function VolunteerNav({ href, label }: { href: string; label: string }) {
  return (
    <nav aria-label="Volunteer navigation" className={styles.nav}>
      <Image alt="Pawcast" className={styles.wordmark} src={pawcastWordmark} />
      <Link
        className={styles.backLink}
        href={href}
        transitionTypes={["nav-back"]}
      >
        <span aria-hidden="true">←</span> {label}
      </Link>
    </nav>
  );
}

export function VolunteerPhoto({
  src,
  alt = "",
  className,
  sizes,
  unoptimized = false,
}: {
  src?: string;
  alt?: string;
  className?: string;
  sizes: string;
  unoptimized?: boolean;
}) {
  return (
    <span className={clsx(styles.photo, className)}>
      {src ? (
        <Image
          alt={alt}
          fill
          sizes={sizes}
          src={src}
          unoptimized={unoptimized}
        />
      ) : (
        <span
          className={styles.photoFallback}
          role="img"
          aria-label={alt || "No photo available"}
        >
          No photo yet
        </span>
      )}
    </span>
  );
}
