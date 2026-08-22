"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FeltButton, FeltField, StitchBadge } from "@/components/felt";
import { pushToast } from "@/components/toast";
import { MAX_SMS_LENGTH } from "@/lib/composer";

import { saveSettings, type SettingsState } from "./actions";
import { GMAIL_NOTICE_ID, gmailBlockedReason } from "./gmail-notice";
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

export function DraftEditor({
  bodyText: initialBodyText,
  gmailConnected,
  gmailStatus,
  id,
  smsText: initialSmsText,
  subject: initialSubject,
}: {
  bodyText: string;
  gmailConnected: boolean;
  gmailStatus?: string;
  id: string;
  smsText: string;
  subject: string;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [bodyText, setBodyText] = useState(initialBodyText);
  const [smsText, setSmsText] = useState(initialSmsText);
  const [pending, setPending] = useState<"save" | "approve" | "deny" | null>(null);
  const smsTooLong = smsText.length > MAX_SMS_LENGTH;

  async function persistDraft() {
    if (smsTooLong) {
      pushToast("error", `SMS text must be ${MAX_SMS_LENGTH} characters or fewer.`);
      return false;
    }

    const response = await fetch(`/api/pupdates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, emailBody: bodyText, smsBody: smsText }),
    });
    if (!response.ok) {
      pushToast("error", await responseError(response, "Save draft"));
      return false;
    }
    return true;
  }

  async function save() {
    setPending("save");
    try {
      if (await persistDraft()) {
        pushToast("success", "Draft changes saved.");
        router.refresh();
      }
    } catch {
      pushToast("error", "Save draft could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  async function approve() {
    if (!gmailConnected) return;

    setPending("approve");
    try {
      if (!(await persistDraft())) return;
      const response = await fetch(`/api/pupdates/${id}/approve`, { method: "POST" });
      if (!response.ok) {
        pushToast("error", await responseError(response, "Approve and send"));
        return;
      }
      pushToast("success", "Approved and sent.");
      router.refresh();
    } catch {
      pushToast("error", "Approve and send could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  async function deny() {
    if (!window.confirm("Discard this draft? This cannot be undone.")) return;

    setPending("deny");
    try {
      const response = await fetch(`/api/pupdates/${id}`, { method: "DELETE" });
      if (!response.ok) {
        pushToast("error", await responseError(response, "Discard draft"));
        return;
      }
      pushToast("success", "Draft discarded.");
      router.refresh();
    } catch {
      pushToast("error", "Discard draft could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.draftEditor}>
      <label htmlFor={`subject-${id}`}>Subject</label>
      <FeltField>
        <input
          id={`subject-${id}`}
          onChange={(event) => setSubject(event.target.value)}
          required
          value={subject}
        />
      </FeltField>
      <label htmlFor={`email-${id}`}>Email body</label>
      <FeltField>
        <textarea
          id={`email-${id}`}
          onChange={(event) => setBodyText(event.target.value)}
          required
          rows={7}
          value={bodyText}
        />
      </FeltField>
      <div className={styles.smsLabelRow}>
        <label htmlFor={`sms-${id}`}>SMS text</label>
        <span className={smsTooLong ? styles.smsError : undefined}>
          {smsText.length}/{MAX_SMS_LENGTH}
        </span>
      </div>
      <FeltField>
        <textarea
          aria-describedby={smsTooLong ? `sms-error-${id}` : undefined}
          aria-invalid={smsTooLong}
          id={`sms-${id}`}
          onChange={(event) => setSmsText(event.target.value)}
          required
          rows={4}
          value={smsText}
        />
      </FeltField>
      {smsTooLong && (
        <p className={styles.smsError} id={`sms-error-${id}`} role="alert">
          Shorten the SMS by {smsText.length - MAX_SMS_LENGTH} characters before saving.
        </p>
      )}
      <div className={styles.draftActions}>
        <FeltButton disabled={pending !== null || smsTooLong} onClick={save} tone="mustard">
          {pending === "save" ? "Saving…" : "Save changes"}
        </FeltButton>
        <FeltButton
          aria-describedby={gmailConnected ? undefined : GMAIL_NOTICE_ID}
          disabled={pending !== null || smsTooLong || !gmailConnected}
          onClick={approve}
          title={gmailConnected ? undefined : gmailBlockedReason(gmailStatus)}
          tone="moss"
        >
          {pending === "approve" ? "Saving & sending…" : "Approve & send"}
        </FeltButton>
        <FeltButton disabled={pending !== null} onClick={deny} tone="brick">
          {pending === "deny" ? "Discarding…" : "Deny & discard"}
        </FeltButton>
      </div>
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
