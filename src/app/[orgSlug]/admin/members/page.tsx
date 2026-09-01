import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AdminBadge, AdminLink } from "@/components/admin-ui";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";
import {
  getOrganizationAccessBySlug,
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from "@/lib/organization-access";

import pawcastWordmark from "../../../../../public/brand/pawcast-wordmark.png";

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
    redirect(access.authenticated ? "/organizations" : `/sign-in?next=${next}`);
  }

  const firstPage = await auth.api.listMembers({
    headers: requestHeaders,
    query: { limit: 100, organizationId: access.context.orgId, sortBy: "createdAt", sortDirection: "asc" },
  });
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

  return (
    <main className={`admin-shell ${styles.page}`}>
      <header className={styles.header}>
        <Link className={styles.logo} href={`/${orgSlug}`}>
          <Image alt="Pawcast" priority src={pawcastWordmark} />
        </Link>
        <div>
          <h1>Organization members</h1>
          <p>{access.organization.name}</p>
        </div>
        <div className={styles.headerActions}>
          <AdminLink href={`/${orgSlug}/admin/settings`} tone="oatmeal">Settings</AdminLink>
          <AdminLink href={`/${orgSlug}/admin`} tone="oatmeal">Back to staff room</AdminLink>
          <SignOutButton />
        </div>
      </header>

      <section aria-labelledby="member-list-title">
        <div className={styles.sectionTitle}>
          <div>
            <p className={styles.eyebrow}>People with access</p>
            <h2 id="member-list-title">Members</h2>
          </div>
          <AdminBadge tone="denim">{members.length} {members.length === 1 ? "person" : "people"}</AdminBadge>
        </div>
        <MemberList
          actorRole={access.context.role as "owner" | "admin"}
          actorUserId={access.context.userId}
          members={members}
          orgSlug={orgSlug}
        />
      </section>

      <footer className={styles.footer}>organization members · keep the right people in the room</footer>
    </main>
  );
}
