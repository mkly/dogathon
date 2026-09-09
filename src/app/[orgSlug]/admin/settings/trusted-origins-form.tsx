"use client";

import { useActionState, useEffect, useState } from "react";

import { AdminButton, AdminField } from "@/components/admin-ui";
import { pushToast } from "@/lib/toast";

import { saveAllowedOrigins, type SettingsState } from "../actions";
import styles from "../admin.module.css";

const initialSettingsState: SettingsState = { status: "idle", message: "" };

export function TrustedOriginsForm({
  allowedOrigins,
  orgSlug,
}: {
  allowedOrigins: string[];
  orgSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveAllowedOrigins,
    initialSettingsState,
  );
  const [origins, setOrigins] = useState(() => allowedOrigins.join("\n"));

  useEffect(() => {
    if (state.status !== "idle") pushToast(state.status, state.message);
  }, [state]);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className={styles.settingsForm}
    >
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <label htmlFor="allowedOrigins">Allowed origins</label>
      <AdminField>
        <textarea
          className={styles.originsTextarea}
          disabled={pending}
          id="allowedOrigins"
          name="allowedOrigins"
          onChange={(event) => setOrigins(event.target.value)}
          placeholder={"https://www.example-rescue.org\nhttp://localhost:3001"}
          rows={5}
          value={origins}
        />
      </AdminField>
      <p className={styles.fieldHint}>
        One HTTPS origin per line, including any non-default port. Localhost is
        accepted only outside production.
      </p>
      <div className={styles.saveRow}>
        <AdminButton disabled={pending} tone="mustard" type="submit">
          {pending ? "Saving…" : "Save trusted rescue sites"}
        </AdminButton>
      </div>
    </form>
  );
}
