import Link from "next/link";

import { FeltPanel } from "@/components/felt";
import { getPublicOrganizations } from "@/lib/public-roster-cache";

export const revalidate = 86400;

export default async function OrganizationIndexPage() {
  const organizations = await getPublicOrganizations();

  return (
    <main className="felt-page">
      <FeltPanel tone="denim">
        <h1>Rescue organizations</h1>
        <p>Choose a rescue to meet the companions currently looking for a sponsor.</p>
      </FeltPanel>
      <FeltPanel tone="oatmeal">
        {organizations.length ? (
          <ul>
            {organizations.map((organization) => (
              <li key={organization.id}>
                <Link href={`/${organization.slug}`}>{organization.name}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No rescue organizations are listed yet.</p>
        )}
      </FeltPanel>
    </main>
  );
}
