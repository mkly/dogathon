"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FeltButton, FeltField, FeltPanel, StitchBadge } from "@/components/felt";
import { pushToast } from "@/components/toast";
import { MAX_SMS_LENGTH } from "@/lib/pupdate-sms";

import { saveSettings, type SettingsState } from "./actions";
import { EMAIL_CONNECTOR_NOTICE_ID, emailConnectorBlockedReason } from "./gmail-notice";
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
  emailConnected,
  id,
  smsText: initialSmsText,
  subject: initialSubject,
}: {
  bodyText: string;
  emailConnected: boolean;
  id: string;
  smsText: string;
  subject: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [savedDraft, setSavedDraft] = useState({
    subject: initialSubject,
    bodyText: initialBodyText,
    smsText: initialSmsText,
  });
  const [subject, setSubject] = useState(initialSubject);
  const [bodyText, setBodyText] = useState(initialBodyText);
  const [smsText, setSmsText] = useState(initialSmsText);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, setPending] = useState<"save" | "approve" | "deny" | null>(null);
  const smsTooLong = smsText.length > MAX_SMS_LENGTH;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (editorOpen && !dialog.open) dialog.showModal();
    if (!editorOpen && dialog.open) dialog.close();
  }, [editorOpen]);

  function openEditor() {
    setSubject(savedDraft.subject);
    setBodyText(savedDraft.bodyText);
    setSmsText(savedDraft.smsText);
    setEditorOpen(true);
  }

  function closeEditor() {
    setSubject(savedDraft.subject);
    setBodyText(savedDraft.bodyText);
    setSmsText(savedDraft.smsText);
    setEditorOpen(false);
  }

  async function persistDraft(draft: typeof savedDraft) {
    if (draft.smsText.length > MAX_SMS_LENGTH) {
      pushToast("error", `SMS text must be ${MAX_SMS_LENGTH} characters or fewer.`);
      return false;
    }

    const response = await fetch(`/api/pupdates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: draft.subject,
        emailBody: draft.bodyText,
        smsBody: draft.smsText,
      }),
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
      const editedDraft = { subject, bodyText, smsText };
      if (await persistDraft(editedDraft)) {
        setSavedDraft(editedDraft);
        setEditorOpen(false);
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
    if (!emailConnected) return;

    setPending("approve");
    try {
      if (!(await persistDraft(savedDraft))) return;
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
    <div className={styles.draftControls}>
      <div className={styles.draftPreview}>
        <p className={styles.draftSubject}>{savedDraft.subject}</p>
        <p>{savedDraft.bodyText}</p>
        <small>SMS: {savedDraft.smsText}</small>
      </div>
      <div className={styles.draftActions}>
        <FeltButton disabled={pending !== null} onClick={openEditor} tone="mustard">
          Edit
        </FeltButton>
        <FeltButton
          aria-describedby={emailConnected ? undefined : EMAIL_CONNECTOR_NOTICE_ID}
          disabled={pending !== null || !emailConnected}
          onClick={approve}
          title={emailConnected ? undefined : emailConnectorBlockedReason()}
          tone="moss"
        >
          {pending === "approve" ? "Saving & sending…" : "Approve & send"}
        </FeltButton>
        <FeltButton disabled={pending !== null} onClick={deny} tone="brick">
          {pending === "deny" ? "Discarding…" : "Deny & discard"}
        </FeltButton>
        {/* the themed email as the sponsor will see it, not the plain draft text */}
        <a
          className={`felt-button felt-denim ${styles.previewLink}`}
          href={`/api/pupdates/${id}/preview`}
          rel="noreferrer"
          target="_blank"
        >
          Preview email
        </a>
      </div>

      <dialog
        aria-labelledby={`edit-draft-title-${id}`}
        className={styles.draftDialog}
        onCancel={(event) => {
          event.preventDefault();
          closeEditor();
        }}
        onClose={() => setEditorOpen(false)}
        ref={dialogRef}
      >
        <FeltPanel className={styles.dialogPanel} tone="oatmeal">
          <div className={styles.dialogHeader}>
            <div>
              <p className={styles.eyebrow}>Draft pupdate</p>
              <h2 id={`edit-draft-title-${id}`}>Edit message</h2>
            </div>
            <FeltButton aria-label="Close editor" onClick={closeEditor} tone="oatmeal">
              ✕
            </FeltButton>
          </div>
          <div className={styles.draftEditor}>
            <label htmlFor={`subject-${id}`}>Subject</label>
            <FeltField>
              <input
                autoFocus
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
            <div className={styles.modalActions}>
              <FeltButton disabled={pending === "save"} onClick={closeEditor} tone="oatmeal">
                Cancel
              </FeltButton>
              <FeltButton disabled={pending !== null || smsTooLong} onClick={save} tone="mustard">
                {pending === "save" ? "Saving…" : "Save changes"}
              </FeltButton>
            </div>
          </div>
        </FeltPanel>
      </dialog>
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

export function StaffTools() {
  const [pending, setPending] = useState(false);

  async function syncNow() {
    setPending(true);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as {
          refused?: boolean;
          reason?: unknown;
        } | null;
        if (failure?.refused) {
          const detail = typeof failure.reason === "string" ? ` ${failure.reason}` : "";
          pushToast("error", `Unable to sync at this time.${detail}`);
        } else {
          pushToast("error", routeError("Roster sync", response.status));
        }
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
      setPending(false);
    }
  }

  return (
    <div className={styles.staffTools}>
      <FeltButton disabled={pending} onClick={syncNow} tone="mustard">
        {pending ? "Syncing…" : "Sync now"}
      </FeltButton>
    </div>
  );
}

type ConnectorStatus = {
  connected: boolean;
  type: "gmail" | "microsoft" | "smtp" | null;
  fromEmail: string | null;
};

export function EmailConnectorSettings({ initialConnector }: { initialConnector: ConnectorStatus }) {
  const [connector, setConnector] = useState(initialConnector);
  const [pending, setPending] = useState<"gmail" | "microsoft" | "smtp" | "disconnect" | null>(null);

  async function connectOAuth(provider: "gmail" | "microsoft") {
    setPending(provider);
    try {
      const response = await fetch(`/api/email-connectors/${provider}/authorize`, { method: "POST" });
      if (!response.ok) {
        pushToast("error", await responseError(response, `Connect ${provider}`));
        return;
      }
      const body = (await response.json()) as { url?: string };
      if (!body.url) {
        pushToast("error", "The email provider returned no authorization URL.");
        return;
      }
      window.location.assign(body.url);
    } catch {
      pushToast("error", `Could not start the ${provider} connection.`);
    } finally {
      setPending(null);
    }
  }

  async function saveSmtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending("smtp");
    try {
      const form = new FormData(formElement);
      const response = await fetch("/api/email-connectors/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: form.get("smtpHost"),
          port: form.get("smtpPort"),
          secure: form.get("smtpSecure") === "on",
          user: form.get("smtpUser"),
          password: form.get("smtpPassword"),
          fromEmail: form.get("smtpFromEmail"),
        }),
      });
      if (!response.ok) {
        pushToast("error", await responseError(response, "Verify SMTP"));
        return;
      }
      const status = (await response.json()) as ConnectorStatus;
      setConnector(status);
      formElement.reset();
      pushToast("success", "SMTP verified and saved for this organization.");
    } catch {
      pushToast("error", "SMTP verification could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    setPending("disconnect");
    try {
      const response = await fetch("/api/email-connectors", { method: "DELETE" });
      if (!response.ok) {
        pushToast("error", await responseError(response, "Disconnect email"));
        return;
      }
      setConnector({ connected: false, type: null, fromEmail: null });
      pushToast("success", "Organization email disconnected.");
    } catch {
      pushToast("error", "Email disconnect could not reach the server.");
    } finally {
      setPending(null);
    }
  }

  const providerLabel = connector.type === "microsoft"
    ? "Microsoft 365"
    : connector.type === "gmail"
      ? "Gmail"
      : "SMTP";

  return (
    <FeltPanel className={styles.connectorSettings} tone="oatmeal">
      <div className={styles.connectorHeader}>
        <div>
          <p className={styles.eyebrow}>Organization email</p>
          <h2>Choose one sending connection</h2>
          <p>Connecting a provider replaces this organization&apos;s previous email connection.</p>
        </div>
        <div className={styles.connectorStatus}>
          <StitchBadge tone={connector.connected ? "moss" : "brick"}>
            {connector.connected
              ? `${providerLabel}: ${connector.fromEmail}`
              : "No verified connector"}
          </StitchBadge>
          {connector.connected && (
            <FeltButton disabled={pending !== null} onClick={disconnect} tone="brick">
              {pending === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </FeltButton>
          )}
        </div>
      </div>
      <div className={styles.oauthChoices}>
        <FeltButton disabled={pending !== null} onClick={() => connectOAuth("gmail")} tone="denim">
          {pending === "gmail" ? "Opening Gmail…" : "Connect Gmail"}
        </FeltButton>
        <FeltButton disabled={pending !== null} onClick={() => connectOAuth("microsoft")} tone="denim">
          {pending === "microsoft" ? "Opening Microsoft…" : "Connect Microsoft 365"}
        </FeltButton>
      </div>
      <form className={styles.smtpForm} onSubmit={saveSmtp}>
        <h3>Plain SMTP with password authentication</h3>
        <label htmlFor="smtpHost">Host</label>
        <FeltField><input id="smtpHost" name="smtpHost" required /></FeltField>
        <label htmlFor="smtpPort">Port</label>
        <FeltField><input defaultValue="587" id="smtpPort" max="65535" min="1" name="smtpPort" required type="number" /></FeltField>
        <label htmlFor="smtpUser">Username</label>
        <FeltField><input autoComplete="username" id="smtpUser" name="smtpUser" required /></FeltField>
        <label htmlFor="smtpPassword">Password</label>
        <FeltField><input autoComplete="new-password" id="smtpPassword" name="smtpPassword" required type="password" /></FeltField>
        <label htmlFor="smtpFromEmail">From email</label>
        <FeltField><input id="smtpFromEmail" name="smtpFromEmail" required type="email" /></FeltField>
        <label className={styles.smtpSecure} htmlFor="smtpSecure">
          <input id="smtpSecure" name="smtpSecure" type="checkbox" /> TLS from connection start (usually port 465)
        </label>
        <div className={styles.saveRow}>
          <FeltButton disabled={pending !== null} tone="mustard" type="submit">
            {pending === "smtp" ? "Verifying…" : "Verify & use SMTP"}
          </FeltButton>
        </div>
      </form>
    </FeltPanel>
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
