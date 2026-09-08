"use client";

import { type ReactNode, useCallback, useRef, useSyncExternalStore } from "react";

import type { FeltButtonProps } from "@/components/felt";
import { PendingFeltSubmitButton } from "@/components/pending-submit-button";

const never = () => () => {};

// Stays disabled until every required field in the enclosing form is valid,
// so the sponsor cannot reach checkout with a missing name or email.
export function SponsorSubmitButton({
  children,
  pendingLabel,
  ...props
}: FeltButtonProps & { pendingLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const subscribe = useCallback((onChange: () => void) => {
    const form = ref.current?.form;
    if (!form) return never();
    form.addEventListener("input", onChange);
    form.addEventListener("change", onChange);
    return () => {
      form.removeEventListener("input", onChange);
      form.removeEventListener("change", onChange);
    };
  }, []);
  const valid = useSyncExternalStore(
    subscribe,
    () => ref.current?.form?.checkValidity() ?? false,
    () => false,
  );

  return (
    <PendingFeltSubmitButton {...props} disabled={!valid || props.disabled} pendingLabel={pendingLabel} ref={ref}>
      {children}
    </PendingFeltSubmitButton>
  );
}
