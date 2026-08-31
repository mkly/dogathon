"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminBadge, AdminButton, AdminField, AdminLink, AdminSurface } from "@/components/admin-ui";
import { pushToast } from "@/components/toast";
import { MAX_SMS_LENGTH } from "@/lib/pupdate-sms";

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
  orgSlug,
  smsText: initialSmsText,
  subject: initialSubject,
}: {
  bodyText: string;
  gmailConnected: boolean;
  gmailStatus?: string;
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
    if (!gmailConnected) return;

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
          aria-describedby={gmailConnected ? undefined : GMAIL_NOTICE_ID}
          disabled={pending !== null || !gmailConnected}
          onClick={approve}
          title={gmailConnected ? undefined : gmailBlockedReason(gmailStatus)}
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

type GmailStatus = { connected: boolean; email?: string; status?: string };

export function StaffTools({ initialGmail, orgSlug }: { initialGmail: GmailStatus; orgSlug: string }) {
  const [gmail, setGmail] = useState<GmailStatus | null>(initialGmail);
  const [pending, setPending] = useState<"gmail" | "sync" | null>(null);

  useEffect(() => {
    let current = true;

    fetch("/api/arcade/gmail/status", {
      cache: "no-store",
      headers: { "X-Organization-Slug": orgSlug },
    })
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
  }, [orgSlug]);

  async function syncNow() {
    setPending("sync");
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "X-Organization-Slug": orgSlug },
      });
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
      setPending(null);
    }
  }

  async function connectGmail() {
    setPending("gmail");
    try {
      const response = await fetch("/api/arcade/gmail/authorize", {
        method: "POST",
        headers: { "X-Organization-Slug": orgSlug },
      });
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
        <AdminBadge tone={gmail?.connected ? "moss" : "brick"}>
          {gmail === null
            ? "Checking Gmail…"
            : gmail.connected
              ? `Sending as ${gmail.email ?? "connected Gmail"}`
              : "Gmail not connected"}
        </AdminBadge>
        {!gmail?.connected && (
          <AdminButton disabled={pending === "gmail"} onClick={connectGmail} tone="denim">
            {pending === "gmail" ? "Connecting…" : "Connect Gmail"}
          </AdminButton>
        )}
      </div>
      <AdminButton disabled={pending === "sync"} onClick={syncNow} tone="mustard">
        {pending === "sync" ? "Syncing…" : "Sync now"}
      </AdminButton>
    </div>
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
