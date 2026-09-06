"use client";

import { useSearchParams } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";

import { FeltLink, FeltPanel, StitchBadge } from "@/components/felt";
import { SPONSORSHIP_MONTHLY_USD } from "@/lib/sponsorship-pricing";

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
          <p>
            Your ${SPONSORSHIP_MONTHLY_USD} monthly sponsorship is active until {name} is adopted.
          </p>
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
        : error === "billing"
          ? "Online sponsorship is not ready for this rescue yet. Please try again later."
          : error === "rate-limited"
            ? "Please wait a little before trying to sponsor again."
          : "Please complete the required fields."}
    </p>
  );
}

const subscribeToNothing = () => () => {};

export function CompanionSponsorState({ children }: { children: ReactNode }) {
  const search = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.search,
    () => "",
  );
  const params = new URLSearchParams(search);

  if (params.get("sponsored") === "1" && !params.get("error")) return null;
  return children;
}
