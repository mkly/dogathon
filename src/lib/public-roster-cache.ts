import { revalidateTag, unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";

const PUBLIC_ROSTER_TAG = "public-roster";
const PUBLIC_ROSTER_CACHE = { tags: [PUBLIC_ROSTER_TAG], revalidate: 86400 };
const PUBLIC_ORGANIZATION_LIMIT = 100;
const PUBLIC_RESIDENT_LIMIT = 500;

export const getPublicOrganizations = unstable_cache(
  () => prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
    take: PUBLIC_ORGANIZATION_LIMIT,
  }),
  ["public-organizations"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicOrganization = unstable_cache(
  (slug: string) => prisma.organization.findUnique({ where: { slug } }),
  ["public-organization"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicResidents = unstable_cache(
  (orgId: string) => prisma.resident.findMany({
    where: { orgId, status: "available" },
    orderBy: { name: "asc" },
    take: PUBLIC_RESIDENT_LIMIT,
  }),
  ["public-residents"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicResident = unstable_cache(
  (orgId: string, id: string) => prisma.resident.findFirst({ where: { id, orgId } }),
  ["public-resident"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicCompanionParams = unstable_cache(
  () => prisma.resident.findMany({
    where: { status: "available" },
    orderBy: { id: "asc" },
    select: { id: true, organization: { select: { slug: true } } },
    take: PUBLIC_RESIDENT_LIMIT,
  }),
  ["public-companion-params"],
  PUBLIC_ROSTER_CACHE,
);

export function revalidatePublicRoster() {
  revalidateTag(PUBLIC_ROSTER_TAG, "max");
}
