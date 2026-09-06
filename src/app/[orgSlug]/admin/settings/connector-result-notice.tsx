"use client";

import { useEffect, useState } from "react";

import { AdminButton } from "@/components/admin-ui";

import styles from "../admin.module.css";

export function ConnectorResultNotice({ result }: { result: "connected" | "error" }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("emailConnector");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  if (!visible) return null;

  const connected = result === "connected";
  return (
    <div
      className={`${styles.settingsNotice} ${connected ? "" : styles.settingsNoticeError}`}
      role={connected ? "status" : "alert"}
    >
      <p>
        {connected
          ? "Email connector connected. Sponsor updates are ready to send."
          : "The email connector could not be connected. Please try again."}
      </p>
      <AdminButton onClick={() => setVisible(false)} tone="oatmeal" type="button">
        Dismiss
      </AdminButton>
    </div>
  );
}
