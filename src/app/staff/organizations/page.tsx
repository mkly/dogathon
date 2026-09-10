import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AdminEyebrow,
  AdminHeader,
  AdminLink,
  AdminPage,
  AdminSurface,
} from "@/components/admin-ui";
import { PageViewTransition } from "@/components/page-view-transition";
import { PendingAdminSubmitButton } from "@/components/pending-submit-button";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import {
  staffOrganizationsSignInPath,
  type SearchParams,
} from "@/lib/staff-organizations-path";

import { describeInvitationRole } from "../invitations/[id]/invitation-view";
import { setActiveOrganization } from "./actions";
import { CreateOrganizationForm } from "./create-organization-form";
import pawcastWordmark from "../../../../public/brand/pawcast-wordmark.png";
import styles from "./organizations.module.css";

export const dynamic = "force-dynamic";

type OrganizationsPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function OrganizationsPage({
  searchParams,
}: OrganizationsPageProps) {
  const query = await searchParams;
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) redirect(staffOrganizationsSignInPath(query));

  const [organizations, pendingInvitations] = await Promise.all([
    auth.api.listOrganizations({ headers: requestHeaders }),
    prisma.invitation.findMany({
      where: {
        email: { equals: session.user.email, mode: "insensitive" },
        expiresAt: { gt: new Date() },
        status: "pending",
      },
      orderBy: { createdAt: "desc" },
      include: { organization: { select: { name: true } } },
    }),
  ]);

  return (
    <PageViewTransition>
      <AdminPage className={styles.page}>
        <AdminHeader
          className={styles.header}
          actions={<SignOutButton />}
          brand={
            <Link href="/" transitionTypes={["nav-back"]}>
              <Image alt="Pawcast" preload src={pawcastWordmark} />
            </Link>
          }
          title="Your rescue organizations"
        />
        <div className={styles.stack}>
          <AdminSurface
            className={styles.section}
            tone="denim"
            role="region"
            aria-labelledby="organizations-heading"
          >
            <div className={styles.intro}>
              <AdminEyebrow tone="denim">Staff access</AdminEyebrow>
              <h2 id="organizations-heading">Your rescues</h2>
              <p>Choose a rescue to open its staff room.</p>
            </div>
            {organizations.length ? (
              <ul className={styles.list}>
                {organizations.map((organization) => (
                  <li className={styles.row} key={organization.id}>
                    <div className={styles.details}>
                      <h3>{organization.name}</h3>
                      <p>/{organization.slug}</p>
                    </div>
                    <form action={setActiveOrganization}>
                      <input
                        name="organizationId"
                        type="hidden"
                        value={organization.id}
                      />
                      <PendingAdminSubmitButton
                        aria-label={`Open staff room for ${organization.name}`}
                        pendingLabel="Opening…"
                        tone="denim"
                        type="submit"
                      >
                        Open staff room
                      </PendingAdminSubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.empty}>
                <h3>No rescue organizations yet</h3>
                <p>
                  {pendingInvitations.length
                    ? "Review your invitations below to join a rescue, or create an organization of your own."
                    : "Create an organization below, or ask your rescue’s administrator to invite you using the email address on your account."}
                </p>
              </div>
            )}
          </AdminSurface>

          {pendingInvitations.length ? (
            <AdminSurface
              className={styles.section}
              tone="mustard"
              role="region"
              aria-labelledby="invitations-heading"
            >
              <div className={styles.intro}>
                <AdminEyebrow>Join a rescue</AdminEyebrow>
                <h2 id="invitations-heading">Your invitations</h2>
                <p>These rescues have invited you to their team.</p>
              </div>
              <ul className={styles.list}>
                {pendingInvitations.map((pendingInvitation) => {
                  const role = describeInvitationRole(pendingInvitation.role);

                  return (
                    <li className={styles.row} key={pendingInvitation.id}>
                      <div className={styles.details}>
                        <h3>{pendingInvitation.organization.name}</h3>
                        <p>
                          You were invited as a <strong>{role.label}</strong>.
                        </p>
                      </div>
                      <AdminLink
                        aria-label={`View invitation to ${pendingInvitation.organization.name}`}
                        href={`/staff/invitations/${pendingInvitation.id}`}
                        tone="oatmeal"
                      >
                        View invitation
                      </AdminLink>
                    </li>
                  );
                })}
              </ul>
            </AdminSurface>
          ) : null}

          <AdminSurface
            className={styles.section}
            tone="moss"
            role="region"
            aria-labelledby="create-heading"
          >
            <div className={styles.intro}>
              <AdminEyebrow>Getting started</AdminEyebrow>
              <h2 id="create-heading">Create an organization</h2>
              <p>
                Set up a space for your rescue’s animals, sponsorships, and
                team.
              </p>
            </div>
            <CreateOrganizationForm />
          </AdminSurface>
        </div>
      </AdminPage>
    </PageViewTransition>
  );
}
