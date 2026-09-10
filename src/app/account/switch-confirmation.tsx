"use client";

import { useEffect } from "react";

import styles from "./account.module.css";

export function SwitchConfirmation({
  companionName,
  organizationName,
}: {
  companionName: string;
  organizationName: string;
}) {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("switched");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  return (
    <div aria-live="polite" className={styles.switchConfirmation} role="status">
      <strong>You&apos;re now following {companionName}.</strong>
      <span>
        Your {organizationName} sponsorship and monthly amount are unchanged.
      </span>
    </div>
  );
}
