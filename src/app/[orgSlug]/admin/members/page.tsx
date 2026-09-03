import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  AdminBadge,
  AdminFooter,
  AdminHeader,
  AdminLink,
  AdminPage,
  AdminSectionHeader,
} from "@/components/admin-ui";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";
import {
  getOrganizationAccessBySlug,
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from "@/lib/organization-access";

import pawcastWordmark from "../../../../../public/brand/pawcast-wordmark.png";

import { InvitationManager, type InvitationView } from "./invitation-controls";
import { MemberList, type MemberView } from "./member-controls";
import styles from "./members.module.css";

export const dynamic = "force-dynamic";

type MembersPageProps = { params: Promise<{ orgSlug: string }> };

export default async function MembersPage({ params }: MembersPageProps) {
  const { orgSlug } = await params;
  const requestHeaders = await headers();
  const access = await getOrganizationAccessBySlug(requestHeaders, orgSlug, ["owner", "admin"]);

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/members`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }

  const [firstPage, invitationResult] = await Promise.all([
    auth.api.listMembers({
      headers: requestHeaders,
      query: { limit: 100, organizationId: access.context.orgId, sortBy: "createdAt", sortDirection: "asc" },
    }),
    auth.api.listInvitations({
      headers: requestHeaders,
      query: { organizationId: access.context.orgId },
    }),
  ]);
  const result = firstPage.members.length < firstPage.total
    ? await auth.api.listMembers({
        headers: requestHeaders,
        query: {
          limit: firstPage.total,
          organizationId: access.context.orgId,
          sortBy: "createdAt",
          sortDirection: "asc",
        },
      })
    : firstPage;
  const members = result.members.flatMap<MemberView>((member) => {
    if (!ORGANIZATION_ROLES.includes(member.role as OrganizationRole)) return [];
    return [{
      email: member.user.email,
      id: member.id,
      joinedAt: member.createdAt.toISOString(),
      name: member.user.name,
      role: member.role as OrganizationRole,
      userId: member.userId,
    }];
  });
  const invitations = invitationResult.flatMap<InvitationView>((invitation) => {
    if (invitation.status !== "pending") return [];
    if (invitation.role !== "admin" && invitation.role !== "member" && invitation.role !== "volunteer") {
      return [];
    }
    const inviter = result.members.find((member) => member.userId === invitation.inviterId);
    return [{
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
      id: invitation.id,
      inviter: inviter?.user.name || inviter?.user.email || "a former member",
      role: invitation.role,
    }];
  });

  return (
    <AdminPage>
      <AdminHeader
        actions={
          <>
            <AdminLink href={`/${orgSlug}/admin/settings`} tone="oatmeal">Settings</AdminLink>
            <AdminLink href={`/${orgSlug}/admin`} tone="oatmeal">Back to staff room</AdminLink>
            <SignOutButton />
          </>
        }
        actionsClassName={styles.membersHeaderActions}
        brand={<Link href={`/${orgSlug}`}>
          <Image alt="Pawcast" priority src={pawcastWordmark} />
        </Link>}
        className={styles.membersHeader}
        lede={access.organization.name}
        title="Organization members"
      />

      <section aria-labelledby="member-list-title">
        <AdminSectionHeader
          actions={<AdminBadge tone="denim">{members.length} {members.length === 1 ? "person" : "people"}</AdminBadge>}
          eyebrow="People with access"
          title="Members"
          titleId="member-list-title"
        />
        <MemberList
          actorRole={access.context.role as "owner" | "admin"}
          actorUserId={access.context.userId}
          members={members}
          orgSlug={orgSlug}
        />
      </section>

      <section aria-labelledby="invitation-list-title" className={styles.invitationsSection}>
        <AdminSectionHeader
          actions={<AdminBadge tone="mustard">
            {invitations.length} pending
          </AdminBadge>}
          eyebrow="Bring someone into the room"
          title="Invitations"
          titleId="invitation-list-title"
        />
        <InvitationManager invitations={invitations} orgSlug={orgSlug} />
      </section>

      <AdminFooter>organization members · keep the right people in the room</AdminFooter>
    </AdminPage>
  );
}
