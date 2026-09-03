"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminBadge, AdminButton, AdminField, AdminSurface } from "@/components/admin-ui";
import { pushToast } from "@/lib/toast";

import { cancelOrganizationInvitation, inviteOrganizationMember } from "./actions";
import styles from "./members.module.css";

export type InvitationView = {
  email: string;
  expiresAt: string;
  id: string;
  inviter: string;
  role: "admin" | "member" | "volunteer";
};

const ROLE_TONES = {
  admin: "brick",
  member: "denim",
  volunteer: "moss",
} as const;

function formatExpiry(expiresAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(expiresAt));
}

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
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null);
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
      }
    });
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
              <span>Expires {formatExpiry(invitation.expiresAt)} UTC</span>
            </div>
            <AdminButton
              disabled={isPending}
              onClick={() => cancel(invitation)}
              tone="brick"
            >
              {pendingInvitationId === invitation.id ? "Cancelling…" : "Cancel"}
            </AdminButton>
          </AdminSurface>
        ))}
      </div>
    </div>
  );
}
