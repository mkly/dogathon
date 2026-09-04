import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { FeltButton, FeltLink, FeltPanel } from "@/components/felt";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

import { describeInvitationRole } from "../invitations/[id]/invitation-view";
import {
  acceptOrganizationInvitation,
  setActiveOrganization,
} from "./actions";
import { CreateOrganizationForm } from "./create-organization-form";

export const dynamic = "force-dynamic";

type OrganizationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const organizationsQuerySchema = z.object({
  error: z.string().optional().catch(undefined),
  invitation: uuidSchema.optional().catch(undefined),
});

export default async function OrganizationsPage({ searchParams }: OrganizationsPageProps) {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) redirect("/staff/sign-in?next=/staff/organizations");

  const query = organizationsQuerySchema.parse(await searchParams);
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
  const invitation = query.invitation
    ? await auth.api.getInvitation({ query: { id: query.invitation }, headers: requestHeaders })
        .catch(() => null)
    : null;

  return (
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

      {invitation?.status === "pending" && (
        <FeltPanel tone="mustard">
          <p>You were invited to {invitation.organizationName} as {invitation.role}.</p>
          <form action={acceptOrganizationInvitation}>
            <input name="invitationId" type="hidden" value={invitation.id} />
            <FeltButton tone="moss" type="submit">Accept invitation</FeltButton>
          </form>
        </FeltPanel>
      )}

      {query.invitation && !invitation && (
        <p>That invitation is unavailable or belongs to another email address.</p>
      )}
    </main>
  );
}
