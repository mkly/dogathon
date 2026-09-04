import { revalidateTag, unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

const PUBLIC_ROSTER_TAG = "public-roster";

export const getPublicOrganizations = unstable_cache(
  () => prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  }),
  ["public-organizations"],
  { tags: [PUBLIC_ROSTER_TAG] },
);

export const getPublicOrganization = unstable_cache(
  (slug: string) => prisma.organization.findUnique({ where: { slug } }),
  ["public-organization"],
  { tags: [PUBLIC_ROSTER_TAG] },
);

export const getPublicResidents = unstable_cache(
  (orgId: string) => prisma.resident.findMany({
    where: { orgId, status: "available" },
    orderBy: { name: "asc" },
  }),
  ["public-residents"],
  { tags: [PUBLIC_ROSTER_TAG] },
);

export const getPublicResident = unstable_cache(
  (orgId: string, id: string) => prisma.resident.findFirst({ where: { id, orgId } }),
  ["public-resident"],
  { tags: [PUBLIC_ROSTER_TAG] },
);

export const getPublicCompanionParams = unstable_cache(
  () => prisma.resident.findMany({
    select: { id: true, organization: { select: { slug: true } } },
  }),
  ["public-companion-params"],
  { tags: [PUBLIC_ROSTER_TAG] },
);

export function revalidatePublicRoster() {
  revalidateTag(PUBLIC_ROSTER_TAG, "max");
}
