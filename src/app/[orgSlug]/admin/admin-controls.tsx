"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  AdminBadge,
  AdminButton,
  AdminEyebrow,
  AdminField,
  AdminLink,
  AdminSurface,
} from "@/components/admin-ui";
import {
  AnimatePresence,
  motion,
  MotionReveal,
  useMotionTiming,
} from "@/components/motion-primitives";
import { MAX_SMS_LENGTH } from "@/lib/pupdate-sms";
import {
  isTerminalRosterSyncStatus,
  ROSTER_SYNC_POLL_INTERVAL_MS,
  ROSTER_SYNC_POLL_TIMEOUT_MS,
  rosterSyncResultToast,
  rosterSyncStatusLabel,
  type RosterSyncJobView,
} from "@/lib/roster-sync-client";
import { pushToast } from "@/lib/toast";

import {
  refreshAdminPage,
  saveSettings,
  type SettingsState,
} from "./actions";
import {
  EMAIL_CONNECTOR_NOTICE_ID,
  emailConnectorBlockedReason,
} from "./gmail-notice";
import styles from "./admin.module.css";

const MotionAdminSurface = motion.create(AdminSurface);

async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit,
  action: string,
) {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error(`${action} could not reach the server.`);
  }
  if (response.ok) return response;

  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  if (typeof body?.error === "string" && body.error)
    throw new Error(body.error);
  if (response.status === 404)
    throw new Error(`${action} is not wired up yet (404).`);
  throw new Error(`${action} failed (${response.status}). Try again.`);
}

export function DraftEditor({
  bodyText: initialBodyText,
  children,
  emailConnected,
  focusTargetId,
  id,
  orgSlug,
  smsText: initialSmsText,
  subject: initialSubject,
}: {
  bodyText: string;
  children: ReactNode;
  emailConnected: boolean;
  focusTargetId: string;
  id: string;
  orgSlug: string;
  smsText: string;
  subject: string;
}) {
  const [visible, hideOptimistically] = useOptimistic(true);
  const [, startTransition] = useTransition();
  const [savedDraft, setSavedDraft] = useState({
    subject: initialSubject,
    bodyText: initialBodyText,
    smsText: initialSmsText,
  });
  const [subject, setSubject] = useState(initialSubject);
  const [bodyText, setBodyText] = useState(initialBodyText);
  const [smsText, setSmsText] = useState(initialSmsText);
  const [editorOpen, setEditorOpen] = useState(false);
  const [denyConfirmOpen, setDenyConfirmOpen] = useState(false);
  const shouldRestoreFocus = useRef(false);
  const [pending, setPending] = useState<"save" | "approve" | "deny" | null>(
    null,
  );
  const smsTooLong = smsText.length > MAX_SMS_LENGTH;
  const motionTransition = useMotionTiming();

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
      pushToast(
        "error",
        `SMS text must be ${MAX_SMS_LENGTH} characters or fewer.`,
      );
      return false;
    }

    await apiFetch(
      `/api/pupdates/${id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Organization-Slug": orgSlug,
        },
        body: JSON.stringify({
          subject: draft.subject,
          emailBody: draft.bodyText,
          smsBody: draft.smsText,
        }),
      },
      "Save draft",
    );
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
      }
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error
          ? error.message
          : "Save draft could not reach the server.",
      );
    } finally {
      setPending(null);
    }
  }

  function approve() {
    if (!emailConnected) return;

    startTransition(async () => {
      hideOptimistically(false);
      setPending("approve");
      try {
        if (!(await persistDraft(savedDraft))) return;
        await apiFetch(
          `/api/pupdates/${id}/approve`,
          {
            method: "POST",
            headers: { "X-Organization-Slug": orgSlug },
          },
          "Approve and send",
        );
        await refreshAdminPage();
        pushToast("success", "Approved and sent.");
      } catch (error) {
        pushToast(
          "error",
          error instanceof Error
            ? error.message
            : "Approve and send could not reach the server.",
        );
      } finally {
        setPending(null);
      }
    });
  }

  function deny() {
    startTransition(async () => {
      hideOptimistically(false);
      setPending("deny");
      try {
        await apiFetch(
          `/api/pupdates/${id}`,
          {
            method: "DELETE",
            headers: { "X-Organization-Slug": orgSlug },
          },
          "Discard draft",
        );
        await refreshAdminPage();
        pushToast("success", "Draft discarded.");
      } catch (error) {
        pushToast(
          "error",
          error instanceof Error
            ? error.message
            : "Discard draft could not reach the server.",
        );
      } finally {
        setPending(null);
      }
    });
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {visible ? (
        <MotionAdminSurface
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className={styles.queueItem}
          exit={{ opacity: 0, scale: 0.98, y: -8 }}
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          key={id}
          layout
          tone="oatmeal"
          transition={motionTransition}
        >
          {children}
          <div className={styles.draftControls}>
            <div className={styles.draftPreview}>
              <p className={styles.draftSubject}>{savedDraft.subject}</p>
              <p>{savedDraft.bodyText}</p>
              <small>SMS: {savedDraft.smsText}</small>
            </div>
            <div className={styles.draftActions}>
              <AdminButton
                disabled={pending !== null}
                onClick={openEditor}
                tone="mustard"
              >
                Edit
              </AdminButton>
              <AdminButton
                aria-describedby={
                  emailConnected ? undefined : EMAIL_CONNECTOR_NOTICE_ID
                }
                className={styles.approveButton}
                disabled={pending !== null || !emailConnected}
                onClick={approve}
                title={emailConnected ? undefined : emailConnectorBlockedReason()}
                tone="moss"
              >
                {pending === "approve" ? "Saving & sending…" : "Approve & send"}
              </AdminButton>
              <AdminButton
                className={styles.denyButton}
                disabled={pending !== null}
                onClick={() => setDenyConfirmOpen(true)}
                tone="brick"
              >
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

            <Dialog.Root
              onOpenChange={(open) => {
                if (!open) closeEditor();
              }}
              open={editorOpen}
            >
              <Dialog.Portal forceMount>
                <AnimatePresence>
                  {editorOpen ? (
                    <Dialog.Overlay asChild forceMount>
                      <motion.div
                        animate={{ opacity: 1 }}
                        className={styles.dialogOverlay}
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        transition={motionTransition}
                      />
                    </Dialog.Overlay>
                  ) : null}
                </AnimatePresence>
                <AnimatePresence>
                  {editorOpen ? (
                    <Dialog.Content asChild forceMount>
                      <motion.div
                        animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                        className={styles.draftDialog}
                        exit={{ opacity: 0, scale: 0.97, x: "-50%", y: "-48%" }}
                        initial={{ opacity: 0, scale: 0.97, x: "-50%", y: "-48%" }}
                        transition={motionTransition}
                      >
                        <AdminSurface className={styles.dialogPanel} tone="oatmeal">
                          <div className={styles.dialogHeader}>
                            <div>
                              <AdminEyebrow>Draft pupdate</AdminEyebrow>
                              <Dialog.Title asChild>
                                <h2>Edit message</h2>
                              </Dialog.Title>
                            </div>
                            <AdminButton
                              aria-label="Close editor"
                              onClick={closeEditor}
                              tone="oatmeal"
                            >
                              ✕
                            </AdminButton>
                          </div>
                          <Dialog.Description className={styles.dialogDescription}>
                            Review the email and SMS copy before saving this draft.
                          </Dialog.Description>
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
                                aria-describedby={
                                  smsTooLong ? `sms-error-${id}` : undefined
                                }
                                aria-invalid={smsTooLong}
                                id={`sms-${id}`}
                                onChange={(event) => setSmsText(event.target.value)}
                                required
                                rows={4}
                                value={smsText}
                              />
                            </AdminField>
                            <MotionReveal
                              className={styles.inlineReveal}
                              show={smsTooLong}
                            >
                              <p
                                className={styles.smsError}
                                id={`sms-error-${id}`}
                                role="alert"
                              >
                                Shorten the SMS by {smsText.length - MAX_SMS_LENGTH}{" "}
                                characters before saving.
                              </p>
                            </MotionReveal>
                            <div className={styles.modalActions}>
                              <AdminButton
                                disabled={pending === "save"}
                                onClick={closeEditor}
                                tone="oatmeal"
                              >
                                Cancel
                              </AdminButton>
                              <AdminButton
                                className={styles.saveDraftButton}
                                disabled={pending !== null || smsTooLong}
                                onClick={save}
                                tone="mustard"
                              >
                                {pending === "save" ? "Saving…" : "Save changes"}
                              </AdminButton>
                            </div>
                          </div>
                        </AdminSurface>
                      </motion.div>
                    </Dialog.Content>
                  ) : null}
                </AnimatePresence>
              </Dialog.Portal>
            </Dialog.Root>

            <AlertDialog.Root
              onOpenChange={setDenyConfirmOpen}
              open={denyConfirmOpen}
            >
              <AlertDialog.Portal forceMount>
                <AnimatePresence>
                  {denyConfirmOpen ? (
                    <AlertDialog.Overlay asChild forceMount>
                      <motion.div
                        animate={{ opacity: 1 }}
                        className={styles.dialogOverlay}
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        transition={motionTransition}
                      />
                    </AlertDialog.Overlay>
                  ) : null}
                </AnimatePresence>
                <AnimatePresence>
                  {denyConfirmOpen ? (
                    <AlertDialog.Content
                      asChild
                      forceMount
                      onCloseAutoFocus={(event) => {
                        if (!shouldRestoreFocus.current) return;
                        event.preventDefault();
                        shouldRestoreFocus.current = false;
                        document.getElementById(focusTargetId)?.focus();
                      }}
                    >
                      <motion.div
                        animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                        className={styles.alertDialog}
                        exit={{ opacity: 0, scale: 0.96, x: "-50%", y: "-48%" }}
                        initial={{ opacity: 0, scale: 0.96, x: "-50%", y: "-48%" }}
                        transition={motionTransition}
                      >
                        <AdminSurface className={styles.dialogPanel} tone="oatmeal">
                          <AlertDialog.Title asChild>
                            <h2>Discard this draft?</h2>
                          </AlertDialog.Title>
                          <AlertDialog.Description className={styles.dialogDescription}>
                            This cannot be undone.
                          </AlertDialog.Description>
                          <div className={styles.modalActions}>
                            <AlertDialog.Cancel asChild>
                              <AdminButton tone="oatmeal">Cancel</AdminButton>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                              <AdminButton
                                onClick={() => {
                                  shouldRestoreFocus.current = true;
                                  deny();
                                }}
                                tone="brick"
                              >
                                Discard draft
                              </AdminButton>
                            </AlertDialog.Action>
                          </div>
                        </AdminSurface>
                      </motion.div>
                    </AlertDialog.Content>
                  ) : null}
                </AnimatePresence>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </div>
        </MotionAdminSurface>
      ) : null}
    </AnimatePresence>
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
  const [pending, setPending] = useState(false);

  async function compose() {
    setPending(true);
    try {
      await apiFetch(
        "/api/pupdates/compose",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Organization-Slug": orgSlug,
          },
          body: JSON.stringify({ residentId }),
        },
        "Compose pupdate",
      );
      await refreshAdminPage();
      pushToast("success", `${residentName}'s draft is ready for review.`);
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error
          ? error.message
          : "Compose pupdate could not reach the server.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.actionStack}>
      <AdminButton
        className={styles.composeButton}
        disabled={pending}
        onClick={compose}
        tone="denim"
      >
        {pending ? "Composing…" : "Compose pupdate"}
      </AdminButton>
    </div>
  );
}

export function RosterSyncSettings({
  initialSourceUrl,
  orgSlug,
}: {
  initialSourceUrl: string;
  orgSlug: string;
}) {
  const queryClient = useQueryClient();
  const [state, formAction, saving] = useActionState(
    saveSettings,
    initialSettingsState,
  );
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollDeadline, setPollDeadline] = useState<number | null>(null);
  const notifiedJobId = useRef<string | null>(null);
  const savedSourceInput = state.savedSourceInput ?? initialSourceUrl;
  const sourceDirty = sourceUrl !== savedSourceInput;

  useEffect(() => {
    if (state.status === "idle") return;
    pushToast(state.status, state.message);
  }, [state]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(
        "/api/sync",
        {
          method: "POST",
          headers: { "X-Organization-Slug": orgSlug },
        },
        "Roster sync",
      );
      return (await response.json()) as RosterSyncJobView;
    },
    onError: (error) => {
      pushToast(
        "error",
        error.message || "Roster sync could not reach the server.",
      );
    },
    onSuccess: (enqueued) => {
      notifiedJobId.current = null;
      queryClient.setQueryData(["roster-sync", orgSlug, enqueued.id], enqueued);
      setJobId(enqueued.id);
      setPollDeadline(Date.now() + ROSTER_SYNC_POLL_TIMEOUT_MS);
    },
  });

  const jobQuery = useQuery({
    queryKey: ["roster-sync", orgSlug, jobId],
    queryFn: async () => {
      if (!jobId) throw new Error("Roster sync status is missing a job ID.");
      const response = await apiFetch(
        `/api/sync/${encodeURIComponent(jobId)}`,
        {
          headers: { "X-Organization-Slug": orgSlug },
        },
        "Roster sync status",
      );
      return (await response.json()) as RosterSyncJobView;
    },
    enabled: jobId !== null,
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      if (pollDeadline === null || Date.now() >= pollDeadline) return false;
      const currentJob = query.state.data;
      return currentJob && isTerminalRosterSyncStatus(currentJob.status)
        ? false
        : ROSTER_SYNC_POLL_INTERVAL_MS;
    },
  });

  const job = jobQuery.data ?? syncMutation.data ?? null;
  const jobInProgress =
    Boolean(job && !isTerminalRosterSyncStatus(job.status)) &&
    !jobQuery.isError &&
    pollDeadline !== null;
  const syncPending = syncMutation.isPending || jobInProgress;

  useEffect(() => {
    if (!jobQuery.error) return;
    pushToast(
      "error",
      jobQuery.error.message || "Roster sync could not reach the server.",
    );
  }, [jobQuery.error]);

  useEffect(() => {
    if (
      !job ||
      !isTerminalRosterSyncStatus(job.status) ||
      notifiedJobId.current === job.id
    )
      return;
    notifiedJobId.current = job.id;
    setPollDeadline(null);
    const toast = rosterSyncResultToast(job);
    if (toast) pushToast(toast.tone, toast.text);
    else pushToast("error", "Roster sync completed without a usable result.");
  }, [job]);

  // Give up on a job that never drains, the way the hand-rolled poller did,
  // instead of asking the status route for it once a second forever.
  useEffect(() => {
    if (pollDeadline === null) return;
    const timer = setTimeout(
      () => {
        setPollDeadline(null);
        pushToast(
          "warning",
          "Roster sync is still working in the background. Reload to see the result.",
        );
      },
      Math.max(0, pollDeadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pollDeadline]);

  const label = job ? rosterSyncStatusLabel(job) : null;
  const buttonLabel =
    jobInProgress && job?.status === "queued"
      ? "Queued…"
      : jobInProgress && job?.status === "running"
        ? "Syncing…"
        : "Sync now";

  return (
    <form action={formAction} className={styles.settingsForm}>
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <label htmlFor="sourceUrl">Adoption-page source URL</label>
      <AdminField>
        <input
          disabled={saving}
          id="sourceUrl"
          name="sourceUrl"
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder="https://example.com/adoptions"
          required
          type="text"
          value={sourceUrl}
        />
      </AdminField>
      <div className={styles.rosterActions}>
        <AdminButton
          className={styles.saveSourceButton}
          disabled={saving || syncPending}
          tone="denim"
          type="submit"
        >
          {saving ? "Saving…" : "Save source"}
        </AdminButton>
        <AdminButton
          aria-describedby="roster-sync-description"
          className={styles.syncButton}
          disabled={saving || syncPending || sourceDirty}
          onClick={() => syncMutation.mutate()}
          title={
            sourceDirty ? "Save the source URL before syncing." : undefined
          }
          tone="mustard"
        >
          {buttonLabel}
        </AdminButton>
        <MotionReveal className={styles.statusReveal} show={label !== null}>
          <span className={styles.syncStatus} role="status">
            {label}
          </span>
        </MotionReveal>
      </div>
      <MotionReveal className={styles.inlineReveal} show={sourceDirty}>
        <p className={styles.unsavedSource} role="status">
          Save the source URL before syncing so the roster uses this address.
        </p>
      </MotionReveal>
    </form>
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
  const [pending, setPending] = useState<
    "gmail" | "microsoft" | "smtp" | "disconnect" | null
  >(null);
  const [smtpOpen, setSmtpOpen] = useState(false);
  const motionTransition = useMotionTiming();

  async function connectOAuth(provider: "gmail" | "microsoft") {
    setPending(provider);
    try {
      const response = await apiFetch(
        `/api/email-connectors/${provider}/authorize`,
        {
          method: "POST",
          headers: { "X-Organization-Slug": orgSlug },
        },
        `Connect ${provider}`,
      );
      const body = (await response.json()) as { url?: string };
      if (!body.url) {
        pushToast("error", "The email provider returned no authorization URL.");
        return;
      }
      window.location.assign(body.url);
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error
          ? error.message
          : `Could not start the ${provider} connection.`,
      );
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
      const response = await apiFetch(
        "/api/email-connectors/smtp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Organization-Slug": orgSlug,
          },
          body: JSON.stringify({
            host: form.get("smtpHost"),
            port: form.get("smtpPort"),
            secure: form.get("smtpSecure") === "on",
            user: form.get("smtpUser"),
            password: form.get("smtpPassword"),
            fromEmail: form.get("smtpFromEmail"),
          }),
        },
        "Verify SMTP",
      );
      const status = (await response.json()) as ConnectorStatus;
      setConnector(status);
      formElement.reset();
      setSmtpOpen(false);
      pushToast("success", "SMTP verified and saved for this organization.");
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error
          ? error.message
          : "SMTP verification could not reach the server.",
      );
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    setPending("disconnect");
    try {
      await apiFetch(
        "/api/email-connectors",
        {
          method: "DELETE",
          headers: { "X-Organization-Slug": orgSlug },
        },
        "Disconnect email",
      );
      setConnector({ connected: false, type: null, fromEmail: null });
      pushToast("success", "Organization email disconnected.");
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error
          ? error.message
          : "Email disconnect could not reach the server.",
      );
    } finally {
      setPending(null);
    }
  }

  const providerLabel =
    connector.type === "microsoft"
      ? "Microsoft 365"
      : connector.type === "gmail"
        ? "Gmail"
        : "SMTP";

  return (
    <AdminSurface className={styles.connectorSettings} tone="oatmeal">
      <div className={styles.connectorHeader}>
        <div>
          <AdminEyebrow>Organization email</AdminEyebrow>
          <h2>Choose one sending connection</h2>
          <p>
            Connecting a provider replaces this organization&apos;s previous
            email connection.
          </p>
        </div>
        <div className={styles.connectorStatus}>
          <AdminBadge tone={connector.connected ? "moss" : "brick"}>
            {connector.connected
              ? `${providerLabel}: ${connector.fromEmail}`
              : "No verified connector"}
          </AdminBadge>
          <AnimatePresence initial={false}>
            {connector.connected ? (
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                initial={{ opacity: 0, scale: 0.96 }}
                transition={motionTransition}
              >
                <AdminButton
                  className={styles.disconnectButton}
                  disabled={pending !== null}
                  onClick={disconnect}
                  tone="brick"
                >
                  {pending === "disconnect" ? "Disconnecting…" : "Disconnect"}
                </AdminButton>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {!connector.connected ? (
          <motion.div
            animate={{ height: "auto", opacity: 1, y: 0 }}
            className={styles.oauthChoices}
            exit={{ height: 0, opacity: 0, y: -8 }}
            initial={{ height: 0, opacity: 0, y: -8 }}
            transition={motionTransition}
          >
            <AdminButton
              className={styles.gmailButton}
              disabled={pending !== null}
              onClick={() => connectOAuth("gmail")}
              tone="denim"
            >
              {pending === "gmail" ? "Opening Gmail…" : "Connect Gmail"}
            </AdminButton>
            <AdminButton
              className={styles.microsoftButton}
              disabled={pending !== null}
              onClick={() => connectOAuth("microsoft")}
              tone="denim"
            >
              {pending === "microsoft"
                ? "Opening Microsoft…"
                : "Connect Microsoft 365"}
            </AdminButton>
            <AdminButton
              disabled={pending !== null}
              onClick={() => setSmtpOpen(true)}
              tone="denim"
            >
              Connect SMTP with password
            </AdminButton>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Dialog.Root onOpenChange={setSmtpOpen} open={smtpOpen}>
        <Dialog.Portal forceMount>
          <AnimatePresence>
            {smtpOpen ? (
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  animate={{ opacity: 1 }}
                  className={styles.dialogOverlay}
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  transition={motionTransition}
                />
              </Dialog.Overlay>
            ) : null}
          </AnimatePresence>
          <AnimatePresence>
            {smtpOpen ? (
              <Dialog.Content asChild forceMount>
                <motion.div
                  animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                  className={styles.connectorDialog}
                  exit={{ opacity: 0, scale: 0.97, x: "-50%", y: "-48%" }}
                  initial={{ opacity: 0, scale: 0.97, x: "-50%", y: "-48%" }}
                  transition={motionTransition}
                >
                  <AdminSurface className={styles.dialogPanel} tone="oatmeal">
                    <div className={styles.dialogHeader}>
                      <div>
                        <AdminEyebrow>Organization email</AdminEyebrow>
                        <Dialog.Title asChild>
                          <h2>Connect SMTP with password</h2>
                        </Dialog.Title>
                      </div>
                      <AdminButton
                        aria-label="Close SMTP connection form"
                        onClick={() => setSmtpOpen(false)}
                        tone="oatmeal"
                      >
                        ✕
                      </AdminButton>
                    </div>
                    <Dialog.Description className={styles.dialogDescription}>
                      Enter the credentials this organization will use to send email.
                    </Dialog.Description>
                    <form className={styles.smtpForm} onSubmit={saveSmtp}>
                      <label htmlFor="smtpHost">Host</label>
                      <AdminField>
                        <input autoFocus id="smtpHost" name="smtpHost" required />
                      </AdminField>
                      <label htmlFor="smtpPort">Port</label>
                      <AdminField>
                        <input
                          defaultValue="587"
                          id="smtpPort"
                          max="65535"
                          min="1"
                          name="smtpPort"
                          required
                          type="number"
                        />
                      </AdminField>
                      <label htmlFor="smtpUser">Username</label>
                      <AdminField>
                        <input
                          autoComplete="username"
                          id="smtpUser"
                          name="smtpUser"
                          required
                        />
                      </AdminField>
                      <label htmlFor="smtpPassword">Password</label>
                      <AdminField>
                        <input
                          autoComplete="new-password"
                          id="smtpPassword"
                          name="smtpPassword"
                          required
                          type="password"
                        />
                      </AdminField>
                      <label htmlFor="smtpFromEmail">From email</label>
                      <AdminField>
                        <input
                          id="smtpFromEmail"
                          name="smtpFromEmail"
                          required
                          type="email"
                        />
                      </AdminField>
                      <label className={styles.smtpSecure} htmlFor="smtpSecure">
                        <input id="smtpSecure" name="smtpSecure" type="checkbox" />{" "}
                        TLS from connection start (usually port 465)
                      </label>
                      <div className={styles.modalActions}>
                        <AdminButton
                          disabled={pending === "smtp"}
                          onClick={() => setSmtpOpen(false)}
                          tone="oatmeal"
                          type="button"
                        >
                          Cancel
                        </AdminButton>
                        <AdminButton
                          className={styles.smtpButton}
                          disabled={pending !== null}
                          tone="mustard"
                          type="submit"
                        >
                          {pending === "smtp" ? "Verifying…" : "Verify & use SMTP"}
                        </AdminButton>
                      </div>
                    </form>
                  </AdminSurface>
                </motion.div>
              </Dialog.Content>
            ) : null}
          </AnimatePresence>
        </Dialog.Portal>
      </Dialog.Root>
    </AdminSurface>
  );
}

const initialSettingsState: SettingsState = { status: "idle", message: "" };

export function PostscriptSettingsForm({
  orgSlug,
  pinnedPostscript,
}: {
  orgSlug: string;
  pinnedPostscript: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveSettings,
    initialSettingsState,
  );

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
      <div className={styles.saveRow}>
        <AdminButton
          className={styles.postscriptButton}
          disabled={pending}
          tone="mustard"
          type="submit"
        >
          {pending ? "Pinning…" : "Save & pin 📌"}
        </AdminButton>
      </div>
    </form>
  );
}
