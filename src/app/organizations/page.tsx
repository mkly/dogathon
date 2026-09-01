import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltButton, FeltField, FeltPanel } from "@/components/felt";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth-session";
import { getOrganizationContext } from "@/lib/organization-access";

import {
  acceptOrganizationInvitation,
  inviteOrganizationMember,
  setActiveOrganization,
} from "./actions";
import { CreateOrganizationForm } from "./create-organization-form";

export const dynamic = "force-dynamic";

type OrganizationsPageProps = {
  searchParams: Promise<{ invitation?: string }>;
};

export default async function OrganizationsPage({ searchParams }: OrganizationsPageProps) {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) redirect("/sign-in?next=/organizations");

  const query = await searchParams;
  const [organizations, context] = await Promise.all([
    auth.api.listOrganizations({ headers: requestHeaders }),
    getOrganizationContext(requestHeaders, ["owner", "admin"]),
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

      <FeltPanel tone="oatmeal">
        <h2>Create an organization</h2>
        <CreateOrganizationForm />
      </FeltPanel>

      {context && (
        <FeltPanel tone="oatmeal">
          <h2>Invite staff or a volunteer</h2>
          <form action={inviteOrganizationMember}>
            <FeltField><input name="email" placeholder="person@example.com" required type="email" /></FeltField>
            <FeltField>
              <select defaultValue="member" name="role">
                <option value="member">Volunteer</option>
                <option value="admin">Admin</option>
              </select>
            </FeltField>
            <FeltButton tone="moss" type="submit">Send invitation</FeltButton>
          </form>
        </FeltPanel>
      )}

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
