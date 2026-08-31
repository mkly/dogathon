import Link from "next/link";

import { FeltPanel } from "@/components/felt";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrganizationIndexPage() {
  const organizations = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return (
    <main className="felt-page">
      <FeltPanel tone="denim">
        <h1>Rescue organizations</h1>
        <p>Choose a rescue to meet the dogs currently looking for a sponsor.</p>
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
