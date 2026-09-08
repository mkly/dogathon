import { revalidateTag, unstable_cache } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const PUBLIC_ROSTER_TAG = "public-roster";
const PUBLIC_ROSTER_CACHE = { tags: [PUBLIC_ROSTER_TAG], revalidate: 86400 };
const PUBLIC_ORGANIZATION_LIMIT = 100;
const PUBLIC_RESIDENT_LIMIT = 500;

export const PUBLIC_SPONSORABLE_RESIDENT_WHERE = {
  available: true,
  sponsorships: { none: { status: "active" } },
} satisfies Prisma.ResidentWhereInput;

export function isPublicResidentSponsorable(resident: {
  available: boolean;
  _count: { sponsorships: number };
}) {
  return resident.available && resident._count.sponsorships === 0;
}

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
  (slug: string) => prisma.organization.findUnique({
    where: { slug },
    include: {
      settings: true,
      sponsorshipTiers: { orderBy: { position: "asc" } },
    },
  }),
  ["public-organization"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicResidents = unstable_cache(
  (orgId: string) => prisma.resident.findMany({
    where: { orgId, ...PUBLIC_SPONSORABLE_RESIDENT_WHERE },
    orderBy: { name: "asc" },
    take: PUBLIC_RESIDENT_LIMIT,
  }),
  ["public-residents"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicResident = unstable_cache(
  (orgId: string, id: string) => prisma.resident.findFirst({
    where: { id, orgId, ...PUBLIC_SPONSORABLE_RESIDENT_WHERE },
  }),
  ["public-resident"],
  PUBLIC_ROSTER_CACHE,
);

// An empty source URL is the default for every resident that no page named, so
// it identifies nobody and must never match one of them.
export const getPublicResidentBySource = unstable_cache(
  async (orgId: string, sourceUrl: string) => (sourceUrl
    ? prisma.resident.findFirst({
        where: { orgId, sourceUrl, ...PUBLIC_SPONSORABLE_RESIDENT_WHERE },
        select: {
          id: true,
          name: true,
          slug: true,
          sourceUrl: true,
          breed: true,
          ageText: true,
          sex: true,
          photoUrls: true,
          available: true,
          _count: { select: { sponsorships: { where: { status: "active" } } } },
        },
      })
    : null),
  ["public-resident-by-source"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicResidentBySlug = unstable_cache(
  (orgId: string, slug: string) => prisma.resident.findFirst({
    where: { orgId, slug, ...PUBLIC_SPONSORABLE_RESIDENT_WHERE },
    select: {
      id: true,
      name: true,
      slug: true,
      sourceUrl: true,
      breed: true,
      ageText: true,
      sex: true,
      photoUrls: true,
      available: true,
      _count: { select: { sponsorships: { where: { status: "active" } } } },
    },
  }),
  ["public-resident-by-slug"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicCompanionParams = unstable_cache(
  () => prisma.resident.findMany({
    where: PUBLIC_SPONSORABLE_RESIDENT_WHERE,
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
