"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AdminBadge, AdminButton, AdminField, AdminSurface } from "@/components/admin-ui";
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

function formatJoinedDate(joinedAt: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(joinedAt),
  );
}

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
  const router = useRouter();
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ownerCount = members.filter((member) => member.role === "owner").length;

  function changeRole(member: MemberView, role: "admin" | "member" | "volunteer") {
    setPendingMemberId(member.id);
    startTransition(async () => {
      try {
        const result = await updateOrganizationMemberRole({ memberId: member.id, orgSlug, role });
        pushToast(result.ok ? "success" : "error", result.message);
        if (result.ok) router.refresh();
      } catch {
        pushToast("error", "The role change could not reach the server. Try again.");
      } finally {
        setPendingMemberId(null);
      }
    });
  }

  function remove(member: MemberView) {
    if (!window.confirm(`Remove ${member.name || member.email} from this organization?`)) return;

    setPendingMemberId(member.id);
    startTransition(async () => {
      try {
        const result = await removeOrganizationMember({ memberId: member.id, orgSlug });
        pushToast(result.ok ? "success" : "error", result.message);
        if (result.ok) router.refresh();
      } catch {
        pushToast("error", "The removal could not reach the server. Try again.");
      } finally {
        setPendingMemberId(null);
      }
    });
  }

  return (
    <div className={styles.memberList}>
      {members.map((member) => {
        const isSelf = member.userId === actorUserId;
        const isProtectedOwner = member.role === "owner" && (
          actorRole === "admin" || ownerCount <= 1
        );
        const changing = isPending && pendingMemberId === member.id;

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
                Joined {formatJoinedDate(member.joinedAt)}
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
                    disabled={isPending}
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
                disabled={isPending || isSelf || isProtectedOwner}
                onClick={() => remove(member)}
                title={isSelf ? "You cannot remove yourself." : undefined}
                tone="brick"
              >
                {changing ? "Working…" : "Remove"}
              </AdminButton>
            </div>
          </AdminSurface>
        );
      })}
    </div>
  );
}
