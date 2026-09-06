import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import pluralize from "pluralize";
import { Suspense } from "react";

import {
  AdminBadge,
  AdminHeader,
  AdminLink,
  AdminPage,
  AdminSectionHeader,
} from "@/components/admin-ui";
import { SignOutButton } from "@/components/sign-out-button";
import {
  PageViewTransition,
  SuspenseFallback,
  SuspenseReveal,
} from "@/components/page-view-transition";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
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

function loadMembers(requestHeaders: Headers, orgId: string) {
  return auth.api.listMembers({
    headers: requestHeaders,
    query: { limit: 1000, organizationId: orgId, sortBy: "createdAt", sortDirection: "asc" },
  });
}

function memberViews(result: Awaited<ReturnType<typeof loadMembers>>) {
  return result.members.flatMap<MemberView>((member) => {
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
}

async function MembersSection({
  actorRole,
  actorUserId,
  membersPromise,
  orgSlug,
}: {
  actorRole: "owner" | "admin";
  actorUserId: string;
  membersPromise: ReturnType<typeof loadMembers>;
  orgSlug: string;
}) {
  const members = memberViews(await membersPromise);

  return (
    <section aria-labelledby="member-list-title">
      <AdminSectionHeader
        actions={<AdminBadge tone="denim">{members.length} {pluralize("person", members.length)}</AdminBadge>}
        eyebrow="People with access"
        title="Members"
        titleId="member-list-title"
      />
      <MemberList actorRole={actorRole} actorUserId={actorUserId} members={members} orgSlug={orgSlug} />
    </section>
  );
}

async function InvitationsSection({
  invitationsPromise,
  membersPromise,
  orgSlug,
}: {
  invitationsPromise: ReturnType<typeof auth.api.listInvitations>;
  membersPromise: ReturnType<typeof loadMembers>;
  orgSlug: string;
}) {
  const [invitationResult, memberResult] = await Promise.all([invitationsPromise, membersPromise]);
  const invitations = invitationResult.flatMap<InvitationView>((invitation) => {
    if (invitation.status !== "pending") return [];
    if (invitation.role !== "admin" && invitation.role !== "member" && invitation.role !== "volunteer") return [];
    const inviter = memberResult.members.find((member) => member.userId === invitation.inviterId);
    return [{
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
      id: invitation.id,
      inviteUrl: new URL(`/staff/invitations/${invitation.id}`, env.BETTER_AUTH_URL).toString(),
      inviter: inviter?.user.name || inviter?.user.email || "a former member",
      role: invitation.role,
    }];
  });

  return (
    <section aria-labelledby="invitation-list-title" className={styles.invitationsSection}>
      <AdminSectionHeader
        actions={<AdminBadge tone="mustard">{invitations.length} pending</AdminBadge>}
        eyebrow="Bring someone into the room"
        title="Invitations"
        titleId="invitation-list-title"
      />
      <InvitationManager invitations={invitations} orgSlug={orgSlug} />
    </section>
  );
}

function MemberSectionLoading({ invitation = false }: { invitation?: boolean }) {
  return (
    <section aria-label={invitation ? "Loading invitations" : "Loading members"} className={invitation ? styles.invitationsSection : undefined}>
      <div className={styles.sectionSkeleton} />
      <div className={styles.memberList}>
        {Array.from({ length: invitation ? 2 : 3 }, (_, index) => (
          <div className={styles.rowSkeleton} key={index} />
        ))}
      </div>
    </section>
  );
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { orgSlug } = await params;
  const requestHeaders = await headers();
  const access = await getOrganizationAccessBySlug(requestHeaders, orgSlug, {
    members: ["manage"],
  });

  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/admin/members`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }

  const membersPromise = loadMembers(requestHeaders, access.context.orgId);
  const invitationsPromise = auth.api.listInvitations({
    headers: requestHeaders,
    query: { organizationId: access.context.orgId },
  });

  return (
    <PageViewTransition>
      <AdminPage>
        <AdminHeader
          actions={
            <>
              <AdminLink href={`/${orgSlug}/admin/settings`} tone="oatmeal">Settings</AdminLink>
              <AdminLink href={`/${orgSlug}/admin`} tone="oatmeal" transitionTypes={["nav-back"]}>Back to staff room</AdminLink>
              <SignOutButton />
            </>
          }
          actionsClassName={styles.membersHeaderActions}
          brand={<Link href={`/${orgSlug}`} transitionTypes={["nav-back"]}>
            <Image alt="Dogathon" preload src={pawcastWordmark} />
          </Link>}
          className={styles.membersHeader}
          lede={access.organization.name}
          title="Organization members"
        />

        <Suspense fallback={<SuspenseFallback><MemberSectionLoading /></SuspenseFallback>}>
          <SuspenseReveal><MembersSection
            actorRole={access.context.role as "owner" | "admin"}
            actorUserId={access.context.userId}
            membersPromise={membersPromise}
            orgSlug={orgSlug}
          /></SuspenseReveal>
        </Suspense>

        <Suspense fallback={<SuspenseFallback><MemberSectionLoading invitation /></SuspenseFallback>}>
          <SuspenseReveal><InvitationsSection
            invitationsPromise={invitationsPromise}
            membersPromise={membersPromise}
            orgSlug={orgSlug}
          /></SuspenseReveal>
        </Suspense>
      </AdminPage>
    </PageViewTransition>
  );
}
