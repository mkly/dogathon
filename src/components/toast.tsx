"use client";

import { useEffect, useSyncExternalStore } from "react";

import { FeltPanel } from "./felt";
import styles from "./toast.module.css";

export type ToastTone = "success" | "warning" | "error";

export type Toast = {
  id: number;
  tone: ToastTone;
  text: string;
};

// Errors are worth reading twice; the happy path can slide away sooner.
const DISMISS_MS: Record<ToastTone, number> = {
  success: 5000,
  warning: 7000,
  error: 9000,
};

// Each tone gets the felt patch the mockups already use for that meaning.
const TONE_PATCH = {
  success: "moss",
  warning: "mustard",
  error: "brick",
} as const;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

// The server never has a toast in flight, so the empty list is the SSR snapshot.
const EMPTY: Toast[] = [];
function getServerSnapshot() {
  return EMPTY;
}

export function dismissToast(id: number) {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

/** Show a toast in the bottom-left stack. Safe to call from any client handler. */
export function pushToast(tone: ToastTone, text: string) {
  const id = nextId++;
  toasts = [...toasts, { id, tone, text }];
  emit();
  return id;
}

function ToastCard({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), DISMISS_MS[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast.id, toast.tone]);

  return (
    <FeltPanel
      className={styles.toast}
      // Errors interrupt; the rest wait their turn in the polite queue.
      role={toast.tone === "error" ? "alert" : "status"}
      tone={TONE_PATCH[toast.tone]}
    >
      <p className={styles.text}>{toast.text}</p>
      <button
        aria-label="Dismiss notification"
        className={styles.dismiss}
        onClick={() => dismissToast(toast.id)}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
    </FeltPanel>
  );
}

/** Rendered once in the root layout; inert until something calls pushToast. */
export function ToastViewport() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div aria-live="polite" className={styles.viewport}>
      {current.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
