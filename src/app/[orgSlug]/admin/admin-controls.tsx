"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBadge, AdminButton, AdminField, AdminLink, AdminSurface } from "@/components/admin-ui";
import { pushToast } from "@/components/toast";
import { MAX_SMS_LENGTH } from "@/lib/pupdate-sms";
import {
  pollRosterSyncJobUntilTerminal,
  rosterSyncResultToast,
  rosterSyncStatusLabel,
  type RosterSyncJobView,
} from "@/lib/roster-sync-client";

import { saveSettings, type SettingsState } from "./actions";
import { EMAIL_CONNECTOR_NOTICE_ID, emailConnectorBlockedReason } from "./gmail-notice";
import styles from "./admin.module.css";

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
  orgSlug,
  smsText: initialSmsText,
  subject: initialSubject,
}: {
  bodyText: string;
  emailConnected: boolean;
  id: string;
  orgSlug: string;
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
      headers: { "Content-Type": "application/json", "X-Organization-Slug": orgSlug },
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
      const response = await fetch(`/api/pupdates/${id}/approve`, {
        method: "POST",
        headers: { "X-Organization-Slug": orgSlug },
      });
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
      const response = await fetch(`/api/pupdates/${id}`, {
        method: "DELETE",
        headers: { "X-Organization-Slug": orgSlug },
      });
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
        <AdminButton disabled={pending !== null} onClick={openEditor} tone="mustard">
          Edit
        </AdminButton>
        <AdminButton
          aria-describedby={emailConnected ? undefined : EMAIL_CONNECTOR_NOTICE_ID}
          disabled={pending !== null || !emailConnected}
          onClick={approve}
          title={emailConnected ? undefined : emailConnectorBlockedReason()}
          tone="moss"
        >
          {pending === "approve" ? "Saving & sending…" : "Approve & send"}
        </AdminButton>
        <AdminButton disabled={pending !== null} onClick={deny} tone="brick">
          {pending === "deny" ? "Discarding…" : "Deny & discard"}
        </AdminButton>
        {/* the themed email as the sponsor will see it, not the plain draft text */}
        <AdminLink
          className={styles.previewLink}
          href={`/api/pupdates/${id}/preview?org=${encodeURIComponent(orgSlug)}`}
          rel="noreferrer"
          target="_blank"
        >
          Preview email
        </AdminLink>
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
        <AdminSurface className={styles.dialogPanel} tone="oatmeal">
          <div className={styles.dialogHeader}>
            <div>
              <p className={styles.eyebrow}>Draft pupdate</p>
              <h2 id={`edit-draft-title-${id}`}>Edit message</h2>
            </div>
            <AdminButton aria-label="Close editor" onClick={closeEditor} tone="oatmeal">
              ✕
            </AdminButton>
          </div>
          <div className={styles.draftEditor}>
            <label htmlFor={`subject-${id}`}>Subject</label>
            <AdminField>
              <input
                autoFocus
                id={`subject-${id}`}
                onChange={(event) => setSubject(event.target.value)}
                required
                value={subject}
              />
            </AdminField>
            <label htmlFor={`email-${id}`}>Email body</label>
            <AdminField>
              <textarea
                id={`email-${id}`}
                onChange={(event) => setBodyText(event.target.value)}
                required
                rows={7}
                value={bodyText}
              />
            </AdminField>
            <div className={styles.smsLabelRow}>
              <label htmlFor={`sms-${id}`}>SMS text</label>
              <span className={smsTooLong ? styles.smsError : undefined}>
                {smsText.length}/{MAX_SMS_LENGTH}
              </span>
            </div>
            <AdminField>
              <textarea
                aria-describedby={smsTooLong ? `sms-error-${id}` : undefined}
                aria-invalid={smsTooLong}
                id={`sms-${id}`}
                onChange={(event) => setSmsText(event.target.value)}
                required
                rows={4}
                value={smsText}
              />
            </AdminField>
            {smsTooLong && (
              <p className={styles.smsError} id={`sms-error-${id}`} role="alert">
                Shorten the SMS by {smsText.length - MAX_SMS_LENGTH} characters before saving.
              </p>
            )}
            <div className={styles.modalActions}>
              <AdminButton disabled={pending === "save"} onClick={closeEditor} tone="oatmeal">
                Cancel
              </AdminButton>
              <AdminButton disabled={pending !== null || smsTooLong} onClick={save} tone="mustard">
                {pending === "save" ? "Saving…" : "Save changes"}
              </AdminButton>
            </div>
          </div>
        </AdminSurface>
      </dialog>
    </div>
  );
}

export function ComposeButton({
  orgSlug,
  residentId,
  residentName,
}: {
  orgSlug: string;
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
        headers: { "Content-Type": "application/json", "X-Organization-Slug": orgSlug },
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
      <AdminButton disabled={pending} onClick={compose} tone="denim">
        {pending ? "Composing…" : "Compose pupdate"}
      </AdminButton>
    </div>
  );
}

export function StaffTools({ orgSlug }: { orgSlug: string }) {
  const [pending, setPending] = useState(false);
  const [job, setJob] = useState<RosterSyncJobView | null>(null);
  const goneRef = useRef(false);

  useEffect(() => () => {
    goneRef.current = true;
  }, []);

  async function fetchJob(jobId: string) {
    const response = await fetch(`/api/sync/${encodeURIComponent(jobId)}`, {
      headers: { "X-Organization-Slug": orgSlug },
    });
    if (!response.ok) throw new Error(await responseError(response, "Roster sync status"));
    return (await response.json()) as RosterSyncJobView;
  }

  async function syncNow() {
    setPending(true);
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "X-Organization-Slug": orgSlug },
      });
      if (!response.ok) {
        pushToast("error", await responseError(response, "Roster sync"));
        return;
      }
      const enqueued = (await response.json()) as RosterSyncJobView;
      setJob(enqueued);
      const outcome = await pollRosterSyncJobUntilTerminal(enqueued, {
        fetchJob,
        onUpdate: setJob,
        cancelled: () => goneRef.current,
      });
      if (!outcome.done) {
        if (outcome.reason === "timeout") {
          pushToast(
            "warning",
            "Roster sync is still working in the background. Reload to see the result.",
          );
        }
        return;
      }
      const toast = rosterSyncResultToast(outcome.job);
      if (toast) pushToast(toast.tone, toast.text);
      else pushToast("error", "Roster sync completed without a usable result.");
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Roster sync could not reach the server.",
      );
    } finally {
      setPending(false);
    }
  }

  const label = job ? rosterSyncStatusLabel(job.status) : null;
  const buttonLabel = job?.status === "queued"
    ? "Queued…"
    : job?.status === "running"
      ? "Syncing…"
      : "Sync now";

  return (
    <div className={styles.staffTools}>
      {label ? <span className={styles.syncStatus} role="status">{label}</span> : null}
      <AdminButton disabled={pending} onClick={syncNow} tone="mustard">
        {buttonLabel}
      </AdminButton>
    </div>
  );
}

type ConnectorStatus = {
  connected: boolean;
  type: "gmail" | "microsoft" | "smtp" | null;
  fromEmail: string | null;
};

export function EmailConnectorSettings({
  initialConnector,
  orgSlug,
}: {
  initialConnector: ConnectorStatus;
  orgSlug: string;
}) {
  const [connector, setConnector] = useState(initialConnector);
  const [pending, setPending] = useState<"gmail" | "microsoft" | "smtp" | "disconnect" | null>(null);

  async function connectOAuth(provider: "gmail" | "microsoft") {
    setPending(provider);
    try {
      const response = await fetch(`/api/email-connectors/${provider}/authorize`, {
        method: "POST",
        headers: { "X-Organization-Slug": orgSlug },
      });
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
        headers: { "Content-Type": "application/json", "X-Organization-Slug": orgSlug },
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
      const response = await fetch("/api/email-connectors", {
        method: "DELETE",
        headers: { "X-Organization-Slug": orgSlug },
      });
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
    <AdminSurface className={styles.connectorSettings} tone="oatmeal">
      <div className={styles.connectorHeader}>
        <div>
          <p className={styles.eyebrow}>Organization email</p>
          <h2>Choose one sending connection</h2>
          <p>Connecting a provider replaces this organization&apos;s previous email connection.</p>
        </div>
        <div className={styles.connectorStatus}>
          <AdminBadge tone={connector.connected ? "moss" : "brick"}>
            {connector.connected
              ? `${providerLabel}: ${connector.fromEmail}`
              : "No verified connector"}
          </AdminBadge>
          {connector.connected && (
            <AdminButton disabled={pending !== null} onClick={disconnect} tone="brick">
              {pending === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </AdminButton>
          )}
        </div>
      </div>
      <div className={styles.oauthChoices}>
        <AdminButton disabled={pending !== null} onClick={() => connectOAuth("gmail")} tone="denim">
          {pending === "gmail" ? "Opening Gmail…" : "Connect Gmail"}
        </AdminButton>
        <AdminButton disabled={pending !== null} onClick={() => connectOAuth("microsoft")} tone="denim">
          {pending === "microsoft" ? "Opening Microsoft…" : "Connect Microsoft 365"}
        </AdminButton>
      </div>
      <form className={styles.smtpForm} onSubmit={saveSmtp}>
        <h3>Plain SMTP with password authentication</h3>
        <label htmlFor="smtpHost">Host</label>
        <AdminField><input id="smtpHost" name="smtpHost" required /></AdminField>
        <label htmlFor="smtpPort">Port</label>
        <AdminField><input defaultValue="587" id="smtpPort" max="65535" min="1" name="smtpPort" required type="number" /></AdminField>
        <label htmlFor="smtpUser">Username</label>
        <AdminField><input autoComplete="username" id="smtpUser" name="smtpUser" required /></AdminField>
        <label htmlFor="smtpPassword">Password</label>
        <AdminField><input autoComplete="new-password" id="smtpPassword" name="smtpPassword" required type="password" /></AdminField>
        <label htmlFor="smtpFromEmail">From email</label>
        <AdminField><input id="smtpFromEmail" name="smtpFromEmail" required type="email" /></AdminField>
        <label className={styles.smtpSecure} htmlFor="smtpSecure">
          <input id="smtpSecure" name="smtpSecure" type="checkbox" /> TLS from connection start (usually port 465)
        </label>
        <div className={styles.saveRow}>
          <AdminButton disabled={pending !== null} tone="mustard" type="submit">
            {pending === "smtp" ? "Verifying…" : "Verify & use SMTP"}
          </AdminButton>
        </div>
      </form>
    </AdminSurface>
  );
}

const initialSettingsState: SettingsState = { status: "idle", message: "" };

export function SettingsForm({
  orgSlug,
  pinnedPostscript,
  sourceUrl,
}: {
  orgSlug: string;
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
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <label htmlFor="pinnedPostscript">This month&apos;s postscript</label>
      <AdminField>
        <textarea
          defaultValue={pinnedPostscript}
          id="pinnedPostscript"
          maxLength={2000}
          name="pinnedPostscript"
          placeholder="A note that rides along with every pupdate…"
        />
      </AdminField>
      <label htmlFor="sourceUrl">Adoption-page source URL</label>
      <AdminField>
        <input
          defaultValue={sourceUrl}
          id="sourceUrl"
          name="sourceUrl"
          placeholder="https://… or seed/dogs-page-A.html"
          required
          type="text"
        />
      </AdminField>
      <div className={styles.saveRow}>
        <AdminButton disabled={pending} tone="mustard" type="submit">
          {pending ? "Pinning…" : "Save & pin 📌"}
        </AdminButton>
      </div>
    </form>
  );
}
