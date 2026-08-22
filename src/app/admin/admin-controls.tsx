"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FeltButton, FeltField, StitchBadge } from "@/components/felt";
import { pushToast } from "@/components/toast";

import { saveSettings, type SettingsState } from "./actions";
import styles from "./admin.module.css";

type SyncResult = {
  usedFallbackCapture: boolean;
  source: string;
};

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

export function ApproveButton({
  gmailConnected,
  gmailStatus,
  id,
}: {
  gmailConnected: boolean;
  gmailStatus: string;
  id: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function approve() {
    if (!gmailConnected) return;

    setPending(true);
    try {
      const response = await fetch(`/api/pupdates/${id}/approve`, { method: "POST" });
      if (!response.ok) {
        pushToast("error", routeError("Approve and send", response.status));
        return;
      }
      pushToast("success", "Approved and sent.");
      router.refresh();
    } catch {
      pushToast("error", "Approve and send could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.actionStack}>
      <FeltButton disabled={pending || !gmailConnected} onClick={approve} tone="moss">
        {pending ? "Sending…" : "Approve & send"}
      </FeltButton>
      {!gmailConnected && (
        <p className={styles.gmailHint}>
          {gmailStatus === "not_configured"
            ? "Gmail sending is not configured yet."
            : "Connect Gmail in staff tools before approving and sending."}
        </p>
      )}
    </div>
  );
}

export function ComposeButton({
  residentId,
  residentName,
}: {
  residentId: string;
  residentName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function compose() {
    setPending(true);
    try {
      const response = await fetch("/api/pupdates/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId }),
      });
      if (!response.ok) {
        pushToast("error", await responseError(response, "Compose pupdate"));
        return;
      }
      pushToast("success", `${residentName}'s draft is ready for review.`);
      router.refresh();
    } catch {
      pushToast("error", "Compose pupdate could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.actionStack}>
      <FeltButton disabled={pending} onClick={compose} tone="denim">
        {pending ? "Composing…" : "Compose pupdate"}
      </FeltButton>
    </div>
  );
}

type GmailStatus = { connected: boolean; email?: string; status?: string };

export function StaffTools({ initialGmail }: { initialGmail: GmailStatus }) {
  const [gmail, setGmail] = useState<GmailStatus | null>(initialGmail);
  const [pending, setPending] = useState<"gmail" | "sync" | null>(null);

  useEffect(() => {
    let current = true;

    fetch("/api/arcade/gmail/status", { cache: "no-store" })
      .then(async (response) => {
        if (!current) return;
        if (!response.ok) {
          setGmail({ connected: false });
          pushToast("error", await responseError(response, "Gmail status"));
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
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (!response.ok) {
        pushToast("error", routeError("Roster sync", response.status));
        return;
      }
      const result = (await response.json()) as SyncResult;
      if (result.usedFallbackCapture) {
        pushToast("warning", `Roster synced from bundled capture (${result.source}).`);
      } else {
        pushToast("success", `Roster synced from live source (${result.source}).`);
      }
    } catch {
      pushToast("error", "Roster sync could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  async function connectGmail() {
    setPending("gmail");
    try {
      const response = await fetch("/api/arcade/gmail/authorize", { method: "POST" });
      if (!response.ok) {
        pushToast("error", await responseError(response, "Gmail connect"));
        return;
      }
      const body = (await response.json()) as { url?: string };
      if (!body.url) {
        pushToast("error", "Gmail connect returned no authorization URL.");
        return;
      }
      window.location.assign(body.url);
    } catch {
      pushToast("error", "Gmail connect could not reach the server.");
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

  // The server action reports through the same corner stack as everything else.
  useEffect(() => {
    if (state.status === "idle") return;
    pushToast(state.status, state.message);
  }, [state]);

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
        <FeltButton disabled={pending} tone="mustard" type="submit">
          {pending ? "Pinning…" : "Save & pin 📌"}
        </FeltButton>
      </div>
    </form>
  );
}
