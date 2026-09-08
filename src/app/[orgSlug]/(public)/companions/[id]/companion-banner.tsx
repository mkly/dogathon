"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { FeltLink, FeltPanel, StitchBadge } from "@/components/felt";

import styles from "../../../../public.module.css";

export function CompanionBanner({ name }: { name: string }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const sponsored = searchParams.get("sponsored") === "1" && !error;
  const checkoutCanceled = searchParams.get("checkout") === "canceled";

  return (
    <>
      {sponsored && (
        <FeltPanel className={`${styles.confirmation} ${styles.confirmationTop}`} tone="moss">
          <StitchBadge tone="cream">You&apos;re a hero!</StitchBadge>
          <h2>Thank you for sponsoring {name}!</h2>
          <p>Your monthly sponsorship stays active for as long as {name} needs a sponsor.</p>
          <FeltLink className={styles.cardLink} href="/account/sign-in">
            Create your sponsor account
          </FeltLink>
        </FeltPanel>
      )}
      {checkoutCanceled && (
        <FeltPanel className={`${styles.confirmation} ${styles.confirmationTop}`} tone="oatmeal">
          <h2>Checkout canceled</h2>
          <p>No sponsorship was created. You can try again whenever you&apos;re ready.</p>
        </FeltPanel>
      )}
    </>
  );
}

export function CompanionFormError({ name }: { name: string }) {
  const error = useSearchParams().get("error");
  if (!error) return null;

  return (
    <p className={styles.formError} role="alert">
      {error === "unavailable"
        ? `${name} is no longer available to sponsor.`
        : error === "invalid-tier"
          ? "Please choose an available sponsorship tier."
        : error === "billing"
          ? "Online sponsorship is not ready for this rescue yet. Please try again later."
          : error === "rate-limited"
            ? "Please wait a little before trying to sponsor again."
          : "Please complete the required fields."}
    </p>
  );
}

export function CompanionSponsorState({
  children,
  sponsored,
}: {
  children: ReactNode;
  sponsored: boolean;
}) {
  return sponsored ? null : children;
}
