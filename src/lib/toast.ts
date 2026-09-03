"use client";

import { toast } from "sonner";

export type ToastTone = "success" | "warning" | "error";

// Errors are worth reading twice; the happy path can slide away sooner.
const DISMISS_MS: Record<ToastTone, number> = {
  success: 5000,
  warning: 7000,
  error: 9000,
};

/** Show a toast in the bottom-left stack. Safe to call from any client handler. */
export function pushToast(tone: ToastTone, text: string) {
  return toast[tone](text, { duration: DISMISS_MS[tone] });
}
