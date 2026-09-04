"use client";

import { useLinkStatus } from "next/link";

import styles from "./admin-ui.module.css";

export function AdminLinkStatus() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={styles.linkStatus}
      data-pending={pending || undefined}
    />
  );
}
