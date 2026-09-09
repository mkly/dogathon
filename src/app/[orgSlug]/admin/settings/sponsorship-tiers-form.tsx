"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useActionState, useEffect, useRef, useState } from "react";

import { AdminBadge, AdminButton, AdminField } from "@/components/admin-ui";
import { pushToast } from "@/lib/toast";

import { saveSponsorshipTiers, type SettingsState } from "../actions";
import styles from "../admin.module.css";

const MAX_TIERS = 6;
const DESCRIPTION_MAX = 200;
const initialSettingsState: SettingsState = { status: "idle", message: "" };

export function SponsorshipTiersForm({
  orgSlug,
  sponsorshipTiers,
}: {
  orgSlug: string;
  sponsorshipTiers: Array<{
    id: string;
    monthlyCents: number;
    description: string;
    isDefault: boolean;
  }>;
}) {
  const [state, formAction, pending] = useActionState(
    saveSponsorshipTiers,
    initialSettingsState,
  );
  // Controlled fields: React resets uncontrolled inputs when the form action
  // settles, which would wipe the values the staff member just saved.
  const [tiers, setTiers] = useState(() =>
    sponsorshipTiers.map((tier) => ({
      key: tier.id,
      monthlyDollars: (tier.monthlyCents / 100).toFixed(2),
      description: tier.description,
      isDefault: tier.isDefault,
    })),
  );
  const focusKeyRef = useRef<string | null>(null);
  const updateTier = (
    key: string,
    patch: { monthlyDollars?: string; description?: string },
  ) =>
    setTiers((current) =>
      current.map((tier) => (tier.key === key ? { ...tier, ...patch } : tier)),
    );

  useEffect(() => {
    if (state.status !== "idle") pushToast(state.status, state.message);
  }, [state]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setTiers((current) =>
      arrayMove(
        current,
        current.findIndex((item) => item.key === active.id),
        current.findIndex((item) => item.key === over.id),
      ),
    );
  };

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className={styles.settingsForm}
    >
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <div className={styles.tierHeader}>
        <span>Monthly tiers</span>
        <span className={styles.tierCount}>
          {tiers.length} of {MAX_TIERS}
        </span>
      </div>
      <p className={styles.fieldHint}>
        Sponsors see tiers in this order. Drag the handle or use the arrow keys
        on it to reorder.
      </p>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={tiers.map((tier) => tier.key)}
          strategy={verticalListSortingStrategy}
        >
          <ol className={styles.tierList}>
            {tiers.map((tier, index) => (
              <TierRow
                index={index}
                key={tier.key}
                onMakeDefault={() =>
                  setTiers((current) =>
                    current.map((item) => ({
                      ...item,
                      isDefault: item.key === tier.key,
                    })),
                  )
                }
                onRemove={() =>
                  setTiers((current) => {
                    const remaining = current.filter(
                      (item) => item.key !== tier.key,
                    );
                    if (remaining.some((item) => item.isDefault))
                      return remaining;
                    return remaining.map((item, itemIndex) => ({
                      ...item,
                      isDefault: itemIndex === 0,
                    }));
                  })
                }
                pending={pending}
                priceRef={(node) => {
                  if (node && focusKeyRef.current === tier.key) {
                    focusKeyRef.current = null;
                    node.focus();
                  }
                }}
                tier={tier}
                tierCount={tiers.length}
                updateTier={updateTier}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <button
        className={styles.tierAdd}
        disabled={pending || tiers.length >= MAX_TIERS}
        onClick={() => {
          const key = crypto.randomUUID();
          const last = Number(tiers[tiers.length - 1]?.monthlyDollars);
          setTiers((current) => [
            ...current,
            {
              key,
              monthlyDollars: (Number.isFinite(last) && last > 0
                ? last + 10
                : 25
              ).toFixed(2),
              description: "",
              isDefault: false,
            },
          ]);
          focusKeyRef.current = key;
        }}
        type="button"
      >
        <span aria-hidden="true">+</span>
        {tiers.length >= MAX_TIERS ? `Up to ${MAX_TIERS} tiers` : "Add a tier"}
      </button>
      <div className={styles.saveRow}>
        <AdminButton disabled={pending} tone="mustard" type="submit">
          {pending ? "Saving…" : "Save sponsorship tiers"}
        </AdminButton>
      </div>
    </form>
  );
}

type Tier = {
  key: string;
  monthlyDollars: string;
  description: string;
  isDefault: boolean;
};

function TierRow({
  index,
  onMakeDefault,
  onRemove,
  pending,
  priceRef,
  tier,
  tierCount,
  updateTier,
}: {
  index: number;
  onMakeDefault: () => void;
  onRemove: () => void;
  pending: boolean;
  priceRef: (node: HTMLInputElement | null) => void;
  tier: Tier;
  tierCount: number;
  updateTier: (
    key: string,
    patch: { monthlyDollars?: string; description?: string },
  ) => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: tier.key, disabled: pending });

  return (
    <li
      className={clsx(
        styles.tier,
        tier.isDefault && styles.tierIsDefault,
        isDragging && styles.tierDragging,
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
        aria-label={`Reorder tier ${index + 1}`}
        className={styles.tierHandle}
        disabled={pending}
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <svg aria-hidden="true" height="16" viewBox="0 0 10 16" width="10">
          <circle cx="3" cy="3" r="1.4" />
          <circle cx="7" cy="3" r="1.4" />
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="7" cy="8" r="1.4" />
          <circle cx="3" cy="13" r="1.4" />
          <circle cx="7" cy="13" r="1.4" />
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
            onChange={(event) =>
              updateTier(tier.key, { monthlyDollars: event.target.value })
            }
            ref={priceRef}
            required
            step="0.01"
            type="number"
            value={tier.monthlyDollars}
          />
          <span aria-hidden="true">/ mo</span>
        </AdminField>
      </div>
      <div className={styles.tierDescriptionCell}>
        <label
          className={styles.srOnly}
          htmlFor={`tier-description-${tier.key}`}
        >
          Description for tier {index + 1}
        </label>
        <AdminField>
          <textarea
            disabled={pending}
            id={`tier-description-${tier.key}`}
            maxLength={DESCRIPTION_MAX}
            name="tierDescription"
            onChange={(event) =>
              updateTier(tier.key, { description: event.target.value })
            }
            placeholder="What this amount covers"
            rows={2}
            value={tier.description}
          />
        </AdminField>
        <span
          className={clsx(
            styles.tierCounter,
            tier.description.length >= DESCRIPTION_MAX - 20 &&
              styles.tierCounterNearLimit,
          )}
        >
          {tier.description.length} / {DESCRIPTION_MAX}
        </span>
      </div>
      <div className={styles.tierRowActions}>
        {tier.isDefault ? (
          <AdminBadge tone="mustard">Default</AdminBadge>
        ) : (
          <button
            className={styles.tierTextButton}
            disabled={pending}
            onClick={onMakeDefault}
            type="button"
          >
            Make default
          </button>
        )}
        <button
          aria-label={`Remove tier ${index + 1}`}
          className={styles.tierRemove}
          disabled={pending || tierCount === 1}
          onClick={onRemove}
          title="Remove tier"
          type="button"
        >
          <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
            <path
              d="M3 3l8 8M11 3l-8 8"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      </div>
    </li>
  );
}
