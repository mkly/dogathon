import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeltButton, FeltPanel } from "@/components/felt";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth-session";
import {
  staffOrganizationsSignInPath,
  type SearchParams,
} from "@/lib/staff-organizations-path";

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

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });

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
    </main>
  );
}
