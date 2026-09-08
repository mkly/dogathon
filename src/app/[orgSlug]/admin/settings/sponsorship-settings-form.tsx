"use client";

import { useActionState, useEffect, useState } from "react";

import { AdminButton, AdminField } from "@/components/admin-ui";
import { pushToast } from "@/lib/toast";

import { saveSettings, type SettingsState } from "../actions";
import styles from "../admin.module.css";

const initialSettingsState: SettingsState = { status: "idle", message: "" };

export function SponsorshipSettingsForm({
  allowedOrigins,
  orgSlug,
  sponsorshipTiers,
}: {
  allowedOrigins: string[];
  orgSlug: string;
  sponsorshipTiers: Array<{ id: string; monthlyCents: number; description: string }>;
}) {
  const [state, formAction, pending] = useActionState(saveSettings, initialSettingsState);
  const [tiers, setTiers] = useState(() => sponsorshipTiers.map((tier) => ({
    ...tier,
    key: tier.id,
  })));

  useEffect(() => {
    if (state.status !== "idle") pushToast(state.status, state.message);
  }, [state]);

  return (
    <form action={formAction} aria-busy={pending} className={styles.settingsForm}>
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <div className={styles.tierList}>
        {tiers.map((tier, index) => (
          <fieldset className={styles.tier} key={tier.key}>
            <legend>Tier {index + 1}</legend>
            <label htmlFor={`tier-monthly-${tier.key}`}>Monthly price in dollars</label>
            <AdminField>
              <input
                defaultValue={(tier.monthlyCents / 100).toFixed(2)}
                disabled={pending}
                id={`tier-monthly-${tier.key}`}
                inputMode="decimal"
                max="10000"
                min="1"
                name="tierMonthlyDollars"
                required
                step="0.01"
                type="number"
              />
            </AdminField>
            <label htmlFor={`tier-description-${tier.key}`}>Short description</label>
            <AdminField>
              <input
                defaultValue={tier.description}
                disabled={pending}
                id={`tier-description-${tier.key}`}
                maxLength={200}
                name="tierDescription"
                type="text"
              />
            </AdminField>
            <div className={styles.tierActions}>
              <AdminButton
                disabled={pending || index === 0}
                onClick={() => setTiers((current) => current.map((item, itemIndex) =>
                  itemIndex === index - 1 ? current[index] : itemIndex === index ? current[index - 1] : item))}
                tone="oatmeal"
                type="button"
              >Move up</AdminButton>
              <AdminButton
                disabled={pending || index === tiers.length - 1}
                onClick={() => setTiers((current) => current.map((item, itemIndex) =>
                  itemIndex === index ? current[index + 1] : itemIndex === index + 1 ? current[index] : item))}
                tone="oatmeal"
                type="button"
              >Move down</AdminButton>
              <AdminButton
                disabled={pending || tiers.length === 1}
                onClick={() => setTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                tone="brick"
                type="button"
              >Remove</AdminButton>
            </div>
          </fieldset>
        ))}
      </div>
      <div>
        <AdminButton
          disabled={pending || tiers.length >= 6}
          onClick={() => setTiers((current) => [...current, {
            id: "",
            key: crypto.randomUUID(),
            monthlyCents: 2500,
            description: "",
          }])}
          tone="oatmeal"
          type="button"
        >Add tier</AdminButton>
      </div>
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
