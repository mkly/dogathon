"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { AdminButton, type AdminButtonProps } from "@/components/admin-ui";
import { FeltButton, type FeltButtonProps } from "@/components/felt";

type PendingLabels = { pendingLabel: string; children: ReactNode };

export function PendingAdminSubmitButton({ children, pendingLabel, ...props }: AdminButtonProps & PendingLabels) {
  const { pending } = useFormStatus();
  return <AdminButton {...props} disabled={pending || props.disabled} style={{ minWidth: "12ch", ...props.style }}>{pending ? pendingLabel : children}</AdminButton>;
}

export function PendingFeltSubmitButton({ children, pendingLabel, ...props }: FeltButtonProps & PendingLabels) {
  const { pending } = useFormStatus();
  return <FeltButton {...props} disabled={pending || props.disabled} style={{ minWidth: "12ch", ...props.style }}>{pending ? pendingLabel : children}</FeltButton>;
}
