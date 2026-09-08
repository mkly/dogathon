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
  // Controlled fields: React resets uncontrolled inputs when the form action
  // settles, which would wipe the values the staff member just saved.
  const [tiers, setTiers] = useState(() => sponsorshipTiers.map((tier) => ({
    key: tier.id,
    monthlyDollars: (tier.monthlyCents / 100).toFixed(2),
    description: tier.description,
  })));
  const [origins, setOrigins] = useState(() => allowedOrigins.join("\n"));
  const updateTier = (key: string, patch: { monthlyDollars?: string; description?: string }) =>
    setTiers((current) => current.map((tier) => (tier.key === key ? { ...tier, ...patch } : tier)));

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
                disabled={pending}
                id={`tier-monthly-${tier.key}`}
                inputMode="decimal"
                max="10000"
                min="1"
                name="tierMonthlyDollars"
                onChange={(event) => updateTier(tier.key, { monthlyDollars: event.target.value })}
                required
                step="0.01"
                type="number"
                value={tier.monthlyDollars}
              />
            </AdminField>
            <label htmlFor={`tier-description-${tier.key}`}>Short description</label>
            <AdminField>
              <input
                disabled={pending}
                id={`tier-description-${tier.key}`}
                maxLength={200}
                name="tierDescription"
                onChange={(event) => updateTier(tier.key, { description: event.target.value })}
                type="text"
                value={tier.description}
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
            key: crypto.randomUUID(),
            monthlyDollars: "25.00",
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
