"use client";

import { pushToast } from "@/lib/toast";

import styles from "./updates.module.css";

type ShareUpdateButtonProps = {
  title: string;
};

export function ShareUpdateButton({ title }: ShareUpdateButtonProps) {
  async function shareUpdate() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      pushToast("success", "Update link copied.");
    } catch {
      pushToast("error", "The link could not be copied. Copy it from your address bar instead.");
    }
  }

  return (
    <button className={styles.shareButton} onClick={shareUpdate} type="button">
      <span aria-hidden="true">↗</span>
      Share this update
    </button>
  );
}
