"use client";

import { useActionState } from "react";

import { AdminButton, AdminField } from "@/components/admin-ui";

import {
  openBillingPortal,
  updateSponsorProfile,
  type AccountActionState,
} from "./actions";
import styles from "./account.module.css";

const initialState: AccountActionState = {};

export function SponsorProfileForm({
  email,
  name,
}: {
  email: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(
    updateSponsorProfile,
    initialState,
  );
  return (
    <form action={action} className={styles.form}>
      <label>
        Name
        <AdminField>
          <input defaultValue={name} name="name" required />
        </AdminField>
      </label>
      <div className={styles.emailField}>
        <span>Email</span>
        <p className={styles.email}>{email}</p>
      </div>
      {state.error ? (
        <p className={styles.actionStatus} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className={styles.actionStatus} role="status">
          Profile saved.
        </p>
      ) : null}
      <div className={styles.profileActions}>
        <AdminButton
          disabled={pending}
          style={{ minWidth: "12ch" }}
          tone="denim"
          type="submit"
        >
          {pending ? "Saving…" : "Save profile"}
        </AdminButton>
      </div>
    </form>
  );
}

export function BillingPortalForm({
  residentName,
  sponsorshipId,
}: {
  residentName: string;
  sponsorshipId: string;
}) {
  const [state, action, pending] = useActionState(
    openBillingPortal.bind(null, sponsorshipId),
    initialState,
  );
  return (
    <form action={action} className={styles.billingForm}>
      {state.error ? (
        <p className={styles.actionStatus} role="alert">
          {state.error}
        </p>
      ) : null}
      <AdminButton
        aria-label={`Manage billing for ${residentName}`}
        className={styles.sponsorshipAction}
        disabled={pending}
        tone="mustard"
        type="submit"
      >
        {pending ? "Opening…" : "Manage billing"}
      </AdminButton>
    </form>
  );
}
