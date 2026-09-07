"use client";

import { useActionState, useEffect } from "react";

import { AdminButton, AdminField } from "@/components/admin-ui";
import { pushToast } from "@/lib/toast";

import { saveSettings, type SettingsState } from "../actions";
import styles from "../admin.module.css";

const initialSettingsState: SettingsState = { status: "idle", message: "" };

export function SponsorshipSettingsForm({
  allowedOrigins,
  orgSlug,
  sponsorshipMonthlyCents,
}: {
  allowedOrigins: string[];
  orgSlug: string;
  sponsorshipMonthlyCents: number;
}) {
  const [state, formAction, pending] = useActionState(saveSettings, initialSettingsState);

  useEffect(() => {
    if (state.status !== "idle") pushToast(state.status, state.message);
  }, [state]);

  return (
    <form action={formAction} aria-busy={pending} className={styles.settingsForm}>
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <label htmlFor="sponsorshipMonthlyDollars">Monthly price in dollars</label>
      <AdminField>
        <input
          defaultValue={(sponsorshipMonthlyCents / 100).toFixed(2)}
          disabled={pending}
          id="sponsorshipMonthlyDollars"
          inputMode="decimal"
          max="10000"
          min="1"
          name="sponsorshipMonthlyDollars"
          required
          step="0.01"
          type="number"
        />
      </AdminField>
      <label htmlFor="allowedOrigins">Allowed origins</label>
      <AdminField>
        <textarea
          className={styles.originsTextarea}
          defaultValue={allowedOrigins.join("\n")}
          disabled={pending}
          id="allowedOrigins"
          name="allowedOrigins"
          placeholder={"https://www.example-rescue.org\nhttp://localhost:3001"}
          rows={5}
        />
      </AdminField>
      <p className={styles.fieldHint}>
        One HTTPS origin per line, including any non-default port. Localhost is accepted only
        outside production.
      </p>
      <div className={styles.saveRow}>
        <AdminButton disabled={pending} tone="mustard" type="submit">
          {pending ? "Saving…" : "Save sponsorship settings"}
        </AdminButton>
      </div>
    </form>
  );
}
