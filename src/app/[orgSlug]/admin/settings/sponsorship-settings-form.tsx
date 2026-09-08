"use client";

import clsx from "clsx";
import { useActionState, useEffect, useRef, useState } from "react";

import { AdminBadge, AdminButton, AdminField } from "@/components/admin-ui";
import { pushToast } from "@/lib/toast";

import { saveSettings, type SettingsState } from "../actions";
import styles from "../admin.module.css";

const MAX_TIERS = 6;
const DESCRIPTION_MAX = 200;
const initialSettingsState: SettingsState = { status: "idle", message: "" };

export function SponsorshipSettingsForm({
  allowedOrigins,
  orgSlug,
  sponsorshipTiers,
}: {
  allowedOrigins: string[];
  orgSlug: string;
  sponsorshipTiers: Array<{
    id: string;
    monthlyCents: number;
    description: string;
    isDefault: boolean;
  }>;
}) {
  const [state, formAction, pending] = useActionState(saveSettings, initialSettingsState);
  // Controlled fields: React resets uncontrolled inputs when the form action
  // settles, which would wipe the values the staff member just saved.
  const [tiers, setTiers] = useState(() => sponsorshipTiers.map((tier) => ({
    key: tier.id,
    monthlyDollars: (tier.monthlyCents / 100).toFixed(2),
    description: tier.description,
    isDefault: tier.isDefault,
  })));
  const [origins, setOrigins] = useState(() => allowedOrigins.join("\n"));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const focusKeyRef = useRef<string | null>(null);
  const updateTier = (key: string, patch: { monthlyDollars?: string; description?: string }) =>
    setTiers((current) => current.map((tier) => (tier.key === key ? { ...tier, ...patch } : tier)));

  useEffect(() => {
    if (state.status !== "idle") pushToast(state.status, state.message);
  }, [state]);

  const moveTier = (from: number, to: number) => {
    if (to < 0 || to >= tiers.length || from === to) return;
    setTiers((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setAnnouncement(`Tier moved to position ${to + 1} of ${tiers.length}.`);
  };

  return (
    <form action={formAction} aria-busy={pending} className={styles.settingsForm}>
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <div className={styles.tierHeader}>
        <span>Monthly tiers</span>
        <span className={styles.tierCount}>{tiers.length} of {MAX_TIERS}</span>
      </div>
      <p className={styles.fieldHint}>
        Sponsors see tiers in this order. Drag the handle or use the arrow keys on it to reorder.
      </p>
      <ol className={styles.tierList}>
        {tiers.map((tier, index) => (
          <li
            className={clsx(
              styles.tier,
              tier.isDefault && styles.tierIsDefault,
              dragKey === tier.key && styles.tierDragging,
              overKey === tier.key && dragKey !== tier.key && styles.tierDropTarget,
            )}
            draggable={dragKey === tier.key}
            key={tier.key}
            onDragEnd={() => { setDragKey(null); setOverKey(null); }}
            onDragOver={(event) => {
              if (!dragKey) return;
              event.preventDefault();
              if (overKey !== tier.key) setOverKey(tier.key);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!dragKey) return;
              moveTier(tiers.findIndex((item) => item.key === dragKey), index);
              setDragKey(null);
              setOverKey(null);
            }}
          >
            <input
              checked={tier.isDefault}
              className={styles.tierDefaultInput}
              name="tierDefault"
              readOnly
              tabIndex={-1}
              type="radio"
              value={index}
            />
            <button
              aria-label={`Reorder tier ${index + 1}. Use arrow keys to move.`}
              className={styles.tierHandle}
              disabled={pending}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") { event.preventDefault(); moveTier(index, index - 1); }
                if (event.key === "ArrowDown") { event.preventDefault(); moveTier(index, index + 1); }
              }}
              onPointerDown={() => setDragKey(tier.key)}
              onPointerUp={() => { if (!overKey) setDragKey(null); }}
              type="button"
            >
              <svg aria-hidden="true" height="16" viewBox="0 0 10 16" width="10">
                <circle cx="3" cy="3" r="1.4" /><circle cx="7" cy="3" r="1.4" />
                <circle cx="3" cy="8" r="1.4" /><circle cx="7" cy="8" r="1.4" />
                <circle cx="3" cy="13" r="1.4" /><circle cx="7" cy="13" r="1.4" />
              </svg>
            </button>
            <span className={styles.tierPosition}>{index + 1}</span>
            <div className={styles.tierPriceCell}>
              <label className={styles.srOnly} htmlFor={`tier-monthly-${tier.key}`}>
                Monthly price for tier {index + 1}
              </label>
              <AdminField className={styles.tierPrice}>
                <span aria-hidden="true">$</span>
                <input
                  disabled={pending}
                  id={`tier-monthly-${tier.key}`}
                  inputMode="decimal"
                  max="10000"
                  min="1"
                  name="tierMonthlyDollars"
                  onChange={(event) => updateTier(tier.key, { monthlyDollars: event.target.value })}
                  ref={(node) => {
                    if (node && focusKeyRef.current === tier.key) {
                      focusKeyRef.current = null;
                      node.focus();
                    }
                  }}
                  required
                  step="0.01"
                  type="number"
                  value={tier.monthlyDollars}
                />
                <span aria-hidden="true">/ mo</span>
              </AdminField>
            </div>
            <div className={styles.tierDescriptionCell}>
              <label className={styles.srOnly} htmlFor={`tier-description-${tier.key}`}>
                Description for tier {index + 1}
              </label>
              <AdminField>
                <input
                  disabled={pending}
                  id={`tier-description-${tier.key}`}
                  maxLength={DESCRIPTION_MAX}
                  name="tierDescription"
                  onChange={(event) => updateTier(tier.key, { description: event.target.value })}
                  placeholder="What this amount covers, in a sentence"
                  type="text"
                  value={tier.description}
                />
              </AdminField>
              <span
                className={clsx(
                  styles.tierCounter,
                  tier.description.length >= DESCRIPTION_MAX - 20 && styles.tierCounterNearLimit,
                )}
              >
                {DESCRIPTION_MAX - tier.description.length} left
              </span>
            </div>
            <div className={styles.tierRowActions}>
              {tier.isDefault ? (
                <AdminBadge tone="mustard">Default</AdminBadge>
              ) : (
                <button
                  className={styles.tierTextButton}
                  disabled={pending}
                  onClick={() => setTiers((current) => current.map((item) => ({
                    ...item,
                    isDefault: item.key === tier.key,
                  })))}
                  type="button"
                >Make default</button>
              )}
              <button
                aria-label={`Remove tier ${index + 1}`}
                className={styles.tierRemove}
                disabled={pending || tiers.length === 1}
                onClick={() => setTiers((current) => {
                  const remaining = current.filter((_, itemIndex) => itemIndex !== index);
                  if (remaining.some((item) => item.isDefault)) return remaining;
                  return remaining.map((item, itemIndex) => ({ ...item, isDefault: itemIndex === 0 }));
                })}
                title="Remove tier"
                type="button"
              >
                <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
                  <path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ol>
      <span aria-live="polite" className={styles.srOnly}>{announcement}</span>
      <button
        className={styles.tierAdd}
        disabled={pending || tiers.length >= MAX_TIERS}
        onClick={() => {
          const key = crypto.randomUUID();
          const last = Number(tiers[tiers.length - 1]?.monthlyDollars);
          setTiers((current) => [...current, {
            key,
            monthlyDollars: (Number.isFinite(last) && last > 0 ? last + 10 : 25).toFixed(2),
            description: "",
            isDefault: false,
          }]);
          focusKeyRef.current = key;
        }}
        type="button"
      >
        <span aria-hidden="true">+</span>
        {tiers.length >= MAX_TIERS ? `Up to ${MAX_TIERS} tiers` : "Add a tier"}
      </button>
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
