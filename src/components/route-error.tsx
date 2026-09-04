"use client";

import { useEffect } from "react";

import { AdminButton } from "./admin-ui";
import styles from "./route-status.module.css";

export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.errorPage}>
      <div className={styles.errorPanel}>
        <h1>This page came unstitched</h1>
        <p>Something went wrong while loading it. Try the request again.</p>
        <AdminButton onClick={reset} tone="brick">Try again</AdminButton>
      </div>
    </main>
  );
}
