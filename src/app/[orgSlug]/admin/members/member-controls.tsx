"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useOptimistic, useState, useTransition } from "react";

import { AdminBadge, AdminButton, AdminField, AdminSurface } from "@/components/admin-ui";
import { formatDate } from "@/lib/format";
import { pushToast } from "@/lib/toast";
import type { OrganizationRole } from "@/lib/organization-access";

import { removeOrganizationMember, updateOrganizationMemberRole } from "./actions";
import styles from "./members.module.css";

export type MemberView = {
  email: string;
  id: string;
  joinedAt: string;
  name: string;
  role: OrganizationRole;
  userId: string;
};

type MemberUpdate =
  | { id: string; role: "admin" | "member" | "volunteer"; type: "role" }
  | { id: string; type: "remove" };

const ROLE_TONES = {
  owner: "mustard",
  admin: "brick",
  member: "denim",
  volunteer: "moss",
} as const;

export function MemberList({
  actorRole,
  actorUserId,
  members,
  orgSlug,
}: {
  actorRole: "owner" | "admin";
  actorUserId: string;
  members: MemberView[];
  orgSlug: string;
}) {
  const [memberToRemove, setMemberToRemove] = useState<MemberView | null>(null);
  const [pendingMemberActions, setPendingMemberActions] = useState<
    Record<string, "remove" | "role">
  >({});
  const [optimisticMembers, updateOptimisticMembers] = useOptimistic<
    MemberView[],
    MemberUpdate
  >(members, (current, update) =>
    update.type === "remove"
      ? current.filter((member) => member.id !== update.id)
      : current.map((member) =>
          member.id === update.id ? { ...member, role: update.role } : member,
        ),
  );
  const [, startTransition] = useTransition();
  const ownerCount = optimisticMembers.filter((member) => member.role === "owner").length;

  function setMemberPending(memberId: string, action: "remove" | "role" | null) {
    setPendingMemberActions((current) => {
      const next = { ...current };
      if (action) next[memberId] = action;
      else delete next[memberId];
      return next;
    });
  }

  function changeRole(member: MemberView, role: "admin" | "member" | "volunteer") {
    setMemberPending(member.id, "role");
    startTransition(async () => {
      updateOptimisticMembers({ id: member.id, role, type: "role" });
      try {
        const result = await updateOrganizationMemberRole({ memberId: member.id, orgSlug, role });
        pushToast(result.ok ? "success" : "error", result.message);
      } catch {
        pushToast("error", "The role change could not reach the server. Try again.");
      } finally {
        setMemberPending(member.id, null);
      }
    });
  }

  function remove(member: MemberView) {
    setMemberPending(member.id, "remove");
    startTransition(async () => {
      updateOptimisticMembers({ id: member.id, type: "remove" });
      try {
        const result = await removeOrganizationMember({ memberId: member.id, orgSlug });
        pushToast(result.ok ? "success" : "error", result.message);
      } catch {
        pushToast("error", "The removal could not reach the server. Try again.");
      } finally {
        setMemberPending(member.id, null);
      }
    });
  }

  return (
    <div className={styles.memberList}>
      {optimisticMembers.map((member) => {
        const isSelf = member.userId === actorUserId;
        const isProtectedOwner = member.role === "owner" && (
          actorRole === "admin" || ownerCount <= 1
        );
        const pendingAction = pendingMemberActions[member.id];

        return (
          <AdminSurface className={styles.memberRow} key={member.id} tone="oatmeal">
            <div className={styles.identity}>
              <div className={styles.nameLine}>
                <h2>{member.name || member.email}</h2>
                {isSelf ? <span className={styles.you}>You</span> : null}
              </div>
              <a href={`mailto:${member.email}`}>{member.email}</a>
            </div>
            <div className={styles.memberMeta}>
              <AdminBadge tone={ROLE_TONES[member.role]}>{member.role}</AdminBadge>
              <span>
                Joined {formatDate(member.joinedAt)}
              </span>
            </div>
            <div className={styles.controls}>
              {isProtectedOwner ? (
                <p className={styles.protectedNote}>
                  {ownerCount <= 1 ? "Last owner" : "Only an owner can manage this person"}
                </p>
              ) : (
                <AdminField className={styles.roleField}>
                  <select
                    aria-label={`Change ${member.name || member.email} role`}
                    defaultValue=""
                    disabled={pendingAction !== undefined}
                    onChange={(event) => {
                      const role = event.target.value as "admin" | "member" | "volunteer";
                      if (role) changeRole(member, role);
                      event.target.value = "";
                    }}
                  >
                    <option disabled value="">Change role…</option>
                    {member.role !== "admin" ? <option value="admin">Admin</option> : null}
                    {member.role !== "member" ? <option value="member">Member</option> : null}
                    {member.role !== "volunteer" ? <option value="volunteer">Volunteer</option> : null}
                  </select>
                </AdminField>
              )}
              <AdminButton
                disabled={pendingAction !== undefined || isSelf || isProtectedOwner}
                onClick={() => setMemberToRemove(member)}
                title={isSelf ? "You cannot remove yourself." : undefined}
                tone="brick"
              >
                {pendingAction === "remove" ? "Working…" : "Remove"}
              </AdminButton>
            </div>
          </AdminSurface>
        );
      })}
      <AlertDialog.Root
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
        open={memberToRemove !== null}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogOverlay} />
          <AlertDialog.Content className={styles.alertDialog}>
            <AdminSurface className={styles.dialogPanel} tone="oatmeal">
              <AlertDialog.Title asChild>
                <h2>Remove organization member?</h2>
              </AlertDialog.Title>
              <AlertDialog.Description className={styles.dialogDescription}>
                Remove {memberToRemove?.name || memberToRemove?.email} from this organization?
              </AlertDialog.Description>
              <div className={styles.dialogActions}>
                <AlertDialog.Cancel asChild>
                  <AdminButton tone="oatmeal">Cancel</AdminButton>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <AdminButton
                    onClick={() => {
                      if (memberToRemove) remove(memberToRemove);
                    }}
                    tone="brick"
                  >
                    Remove member
                  </AdminButton>
                </AlertDialog.Action>
              </div>
            </AdminSurface>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
