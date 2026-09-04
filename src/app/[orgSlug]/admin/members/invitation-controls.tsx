"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminBadge, AdminButton, AdminField, AdminSurface } from "@/components/admin-ui";
import { formatDateTime } from "@/lib/format";
import { pushToast } from "@/lib/toast";

import {
  cancelOrganizationInvitation,
  inviteOrganizationMember,
  resendOrganizationInvitation,
} from "./actions";
import styles from "./members.module.css";

export type InvitationView = {
  email: string;
  expiresAt: string;
  id: string;
  inviteUrl: string;
  inviter: string;
  role: "admin" | "member" | "volunteer";
};

const ROLE_TONES = {
  admin: "brick",
  member: "denim",
  volunteer: "moss",
} as const;

export function InvitationManager({
  invitations,
  orgSlug,
}: {
  invitations: InvitationView[];
  orgSlug: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitationView["role"]>("member");
  const [message, setMessage] = useState("");
  const [copyingInvitationId, setCopyingInvitationId] = useState<string | null>(null);
  const [visibleInviteUrlId, setVisibleInviteUrlId] = useState<string | null>(null);
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null);
  const [pendingInvitationAction, setPendingInvitationAction] = useState<"cancel" | "resend" | null>(null);
  const [isPending, startTransition] = useTransition();

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        const result = await inviteOrganizationMember({ email, orgSlug, role });
        setMessage(result.message);
        pushToast(result.ok ? "success" : "error", result.message);
        if (result.ok) {
          setEmail("");
          router.refresh();
        }
      } catch {
        const failure = "The invitation could not reach the server. Try again.";
        setMessage(failure);
        pushToast("error", failure);
      }
    });
  }

  function cancel(invitation: InvitationView) {
    setMessage("");
    setPendingInvitationId(invitation.id);
    setPendingInvitationAction("cancel");
    startTransition(async () => {
      try {
        const result = await cancelOrganizationInvitation({
          invitationId: invitation.id,
          orgSlug,
        });
        setMessage(result.message);
        pushToast(result.ok ? "success" : "error", result.message);
        if (result.ok) router.refresh();
      } catch {
        const failure = "The cancellation could not reach the server. Try again.";
        setMessage(failure);
        pushToast("error", failure);
      } finally {
        setPendingInvitationId(null);
        setPendingInvitationAction(null);
      }
    });
  }

  function resend(invitation: InvitationView) {
    setMessage("");
    setPendingInvitationId(invitation.id);
    setPendingInvitationAction("resend");
    startTransition(async () => {
      try {
        const result = await resendOrganizationInvitation({
          invitationId: invitation.id,
          orgSlug,
        });
        setMessage(result.message);
        pushToast(result.ok ? "success" : "error", result.message);
        if (result.ok) router.refresh();
      } catch {
        const failure = "The invitation could not reach the server. Try again.";
        setMessage(failure);
        pushToast("error", failure);
      } finally {
        setPendingInvitationId(null);
        setPendingInvitationAction(null);
      }
    });
  }

  async function copyInviteLink(invitation: InvitationView) {
    setCopyingInvitationId(invitation.id);

    if (typeof navigator.clipboard?.writeText !== "function") {
      setVisibleInviteUrlId(invitation.id);
      pushToast("error", "Copying is unavailable. Use the invite link shown below.");
      setCopyingInvitationId(null);
      return;
    }

    try {
      await navigator.clipboard.writeText(invitation.inviteUrl);
      setVisibleInviteUrlId(null);
      pushToast("success", "Invite link copied.");
    } catch {
      setVisibleInviteUrlId(invitation.id);
      pushToast("error", "The invite link could not be copied. Use the link shown below.");
    } finally {
      setCopyingInvitationId(null);
    }
  }

  return (
    <div className={styles.invitationManager}>
      <AdminSurface className={styles.invitationFormSurface} tone="mustard">
        <form className={styles.invitationForm} onSubmit={invite}>
          <AdminField>
            <input
              aria-label="Invitee email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@example.com"
              required
              type="email"
              value={email}
            />
          </AdminField>
          <AdminField>
            <select
              aria-label="Invitation role"
              onChange={(event) => setRole(event.target.value as InvitationView["role"])}
              value={role}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="volunteer">Volunteer</option>
            </select>
          </AdminField>
          <AdminButton disabled={isPending} tone="moss" type="submit">
            {isPending && !pendingInvitationId ? "Sending…" : "Send invitation"}
          </AdminButton>
        </form>
        <p aria-live="polite" className={styles.invitationMessage}>{message}</p>
      </AdminSurface>

      <div className={styles.invitationList}>
        {invitations.length === 0 ? (
          <p className={styles.emptyInvitations}>There are no pending invitations.</p>
        ) : invitations.map((invitation) => (
          <AdminSurface className={styles.invitationRow} key={invitation.id} tone="oatmeal">
            <div className={styles.identity}>
              <h3>{invitation.email}</h3>
              <p>Invited by {invitation.inviter}</p>
            </div>
            <div className={styles.memberMeta}>
              <AdminBadge tone={ROLE_TONES[invitation.role]}>{invitation.role}</AdminBadge>
              <span>Expires {formatDateTime(invitation.expiresAt)} UTC</span>
            </div>
            <div className={styles.invitationActions}>
              <div className={styles.invitationControls}>
                <AdminButton
                  disabled={copyingInvitationId === invitation.id}
                  onClick={() => copyInviteLink(invitation)}
                  tone="denim"
                >
                  {copyingInvitationId === invitation.id ? "Copying…" : "Copy invite link"}
                </AdminButton>
                <AdminButton
                  disabled={isPending}
                  onClick={() => resend(invitation)}
                  tone="moss"
                >
                  {pendingInvitationId === invitation.id && pendingInvitationAction === "resend"
                    ? "Resending…"
                    : "Resend"}
                </AdminButton>
                <AdminButton
                  disabled={isPending}
                  onClick={() => cancel(invitation)}
                  tone="brick"
                >
                  {pendingInvitationId === invitation.id && pendingInvitationAction === "cancel"
                    ? "Cancelling…"
                    : "Cancel"}
                </AdminButton>
              </div>
              {visibleInviteUrlId === invitation.id ? (
                <AdminField>
                  <input
                    aria-label={`Invite link for ${invitation.email}`}
                    onFocus={(event) => event.currentTarget.select()}
                    readOnly
                    value={invitation.inviteUrl}
                  />
                </AdminField>
              ) : null}
            </div>
          </AdminSurface>
        ))}
      </div>
    </div>
  );
}
