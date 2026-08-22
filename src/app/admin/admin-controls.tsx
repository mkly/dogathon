"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FeltButton, FeltField, StitchBadge } from "@/components/felt";

import { saveSettings, type SettingsState } from "./actions";
import styles from "./admin.module.css";

type Toast = { tone: "error" | "success"; text: string } | null;

function routeError(action: string, status: number) {
  if (status === 404) {
    return `${action} is not wired up yet (404).`;
  }
  return `${action} failed (${status}). Try again.`;
}

async function responseError(response: Response, action: string) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" && body.error
    ? body.error
    : routeError(action, response.status);
}

function FeltToast({ toast }: { toast: Toast }) {
  if (!toast) return null;

  return (
    <div
      className={`${styles.toast} ${toast.tone === "error" ? styles.toastError : styles.toastSuccess}`}
      role="status"
    >
      {toast.text}
    </div>
  );
}

export function ApproveButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  async function approve() {
    setPending(true);
    setToast(null);
    try {
      const response = await fetch(`/api/pupdates/${id}/approve`, { method: "POST" });
      if (!response.ok) {
        setToast({ tone: "error", text: routeError("Approve and send", response.status) });
        return;
      }
      setToast({ tone: "success", text: "Approved and sent." });
      router.refresh();
    } catch {
      setToast({ tone: "error", text: "Approve and send could not reach the server." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.actionStack}>
      <FeltButton disabled={pending} onClick={approve} tone="moss">
        {pending ? "Sending…" : "Approve & send"}
      </FeltButton>
      <FeltToast toast={toast} />
    </div>
  );
}

type GmailStatus = { connected: boolean; email?: string };

export function StaffTools() {
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [pending, setPending] = useState<"gmail" | "sync" | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    let current = true;

    fetch("/api/arcade/gmail/status", { cache: "no-store" })
      .then(async (response) => {
        if (!current) return;
        if (!response.ok) {
          setGmail({ connected: false });
          setToast({ tone: "error", text: await responseError(response, "Gmail status") });
          return;
        }
        setGmail((await response.json()) as GmailStatus);
      })
      .catch(() => {
        if (current) setGmail({ connected: false });
      });

    return () => {
      current = false;
    };
  }, []);

  async function syncNow() {
    setPending("sync");
    setToast(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (!response.ok) {
        setToast({ tone: "error", text: routeError("Roster sync", response.status) });
        return;
      }
      setToast({ tone: "success", text: "Roster sync finished." });
    } catch {
      setToast({ tone: "error", text: "Roster sync could not reach the server." });
    } finally {
      setPending(null);
    }
  }

  async function connectGmail() {
    setPending("gmail");
    setToast(null);
    try {
      const response = await fetch("/api/arcade/gmail/authorize", { method: "POST" });
      if (!response.ok) {
        setToast({ tone: "error", text: await responseError(response, "Gmail connect") });
        return;
      }
      const body = (await response.json()) as { url?: string };
      if (!body.url) {
        setToast({ tone: "error", text: "Gmail connect returned no authorization URL." });
        return;
      }
      window.location.assign(body.url);
    } catch {
      setToast({ tone: "error", text: "Gmail connect could not reach the server." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.staffTools}>
      <div className={styles.gmailGroup}>
        <StitchBadge tone={gmail?.connected ? "moss" : "brick"}>
          {gmail === null
            ? "Checking Gmail…"
            : gmail.connected
              ? `Sending as ${gmail.email ?? "connected Gmail"}`
              : "Gmail not connected"}
        </StitchBadge>
        {!gmail?.connected && (
          <FeltButton disabled={pending === "gmail"} onClick={connectGmail} tone="denim">
            {pending === "gmail" ? "Connecting…" : "Connect Gmail"}
          </FeltButton>
        )}
      </div>
      <FeltButton disabled={pending === "sync"} onClick={syncNow} tone="mustard">
        {pending === "sync" ? "Syncing…" : "Sync now"}
      </FeltButton>
      <FeltToast toast={toast} />
    </div>
  );
}

const initialSettingsState: SettingsState = { status: "idle", message: "" };

export function SettingsForm({
  pinnedPostscript,
  sourceUrl,
}: {
  pinnedPostscript: string;
  sourceUrl: string;
}) {
  const [state, formAction, pending] = useActionState(saveSettings, initialSettingsState);

  return (
    <form action={formAction} className={styles.settingsForm}>
      <label htmlFor="pinnedPostscript">This month&apos;s postscript</label>
      <FeltField>
        <textarea
          defaultValue={pinnedPostscript}
          id="pinnedPostscript"
          maxLength={2000}
          name="pinnedPostscript"
          placeholder="A note that rides along with every pupdate…"
        />
      </FeltField>
      <label htmlFor="sourceUrl">Adoption-page source URL</label>
      <FeltField>
        <input
          defaultValue={sourceUrl}
          id="sourceUrl"
          name="sourceUrl"
          placeholder="https://… or seed/dogs-page-A.html"
          required
          type="text"
        />
      </FeltField>
      <div className={styles.saveRow}>
        <span className={styles.formMessage} data-status={state.status} role="status">
          {state.message}
        </span>
        <FeltButton disabled={pending} tone="mustard" type="submit">
          {pending ? "Pinning…" : "Save & pin 📌"}
        </FeltButton>
      </div>
    </form>
  );
}
