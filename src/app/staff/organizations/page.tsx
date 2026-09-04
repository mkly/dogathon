import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltButton, FeltLink, FeltPanel } from "@/components/felt";
import { PageViewTransition } from "@/components/page-view-transition";
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

export const dynamic = "force-dynamic";

type OrganizationsPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function OrganizationsPage({ searchParams }: OrganizationsPageProps) {
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
      <main className="felt-page">
      <FeltPanel tone="denim">
        <h1>Your rescue organizations</h1>
        {organizations.map((organization) => (
          <form action={setActiveOrganization} key={organization.id}>
            <input name="organizationId" type="hidden" value={organization.id} />
            <FeltButton tone="mustard" type="submit">
              Open {organization.name} ({organization.slug})
            </FeltButton>
          </form>
        ))}
      </FeltPanel>

      {pendingInvitations.map((pendingInvitation) => {
        const role = describeInvitationRole(pendingInvitation.role);

        return (
          <FeltPanel key={pendingInvitation.id} tone="mustard">
            <h2>Invitation to {pendingInvitation.organization.name}</h2>
            <p>
              You were invited as a <strong>{role.label}</strong>.
            </p>
            <FeltLink href={`/staff/invitations/${pendingInvitation.id}`} tone="moss">
              View invitation
            </FeltLink>
          </FeltPanel>
        );
      })}

      <FeltPanel tone="oatmeal">
        <h2>Create an organization</h2>
        <CreateOrganizationForm />
      </FeltPanel>
      </main>
    </PageViewTransition>
  );
}
