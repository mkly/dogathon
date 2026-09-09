import { revalidateTag, unstable_cache } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { speciesLabel } from "@/lib/species";

const PUBLIC_ROSTER_TAG = "public-roster";
const PUBLIC_ROSTER_CACHE = { tags: [PUBLIC_ROSTER_TAG], revalidate: 86400 };
const PUBLIC_ORGANIZATION_LIMIT = 100;
const PUBLIC_RESIDENT_LIMIT = 500;

export const PUBLIC_SPONSORABLE_RESIDENT_WHERE = {
  available: true,
  sponsorships: { none: { status: "active" } },
} satisfies Prisma.ResidentWhereInput;

const ACTIVE_SPONSORSHIP_COUNT = {
  _count: { select: { sponsorships: { where: { status: "active" } } } },
} satisfies Prisma.ResidentInclude;

export function isPublicResidentSponsorable(resident: {
  available: boolean;
  _count: { sponsorships: number };
}) {
  return resident.available && resident._count.sponsorships === 0;
}

export const getPublicOrganizations = unstable_cache(
  () =>
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: PUBLIC_ORGANIZATION_LIMIT,
    }),
  ["public-organizations"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicOrganization = unstable_cache(
  (slug: string) =>
    prisma.organization.findUnique({
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
  (orgId: string, species?: string) =>
    prisma.resident.findMany({
      where: {
        orgId,
        ...PUBLIC_SPONSORABLE_RESIDENT_WHERE,
        ...(species ? { species } : {}),
      },
      orderBy: { name: "asc" },
      take: PUBLIC_RESIDENT_LIMIT,
    }),
  ["public-residents"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicSpeciesCounts = unstable_cache(
  async (orgId: string) => {
    const species = await prisma.resident.groupBy({
      by: ["species"],
      where: {
        orgId,
        ...PUBLIC_SPONSORABLE_RESIDENT_WHERE,
        species: { not: "" },
      },
      _count: { _all: true },
    });

    return species
      .map(({ species: value, _count }) => ({
        species: value,
        count: _count._all,
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          speciesLabel(left.species).localeCompare(speciesLabel(right.species)),
      );
  },
  ["public-species-counts"],
  PUBLIC_ROSTER_CACHE,
);

// The companion page is also where checkout returns land, so it reads every
// resident and applies isPublicResidentSponsorable itself: a sponsor coming
// back from Stripe still sees their confirmation for the companion they just
// took off the roster.
export const getPublicResident = unstable_cache(
  (orgId: string, id: string) =>
    prisma.resident.findFirst({
      where: { id, orgId },
      include: ACTIVE_SPONSORSHIP_COUNT,
    }),
  ["public-resident"],
  PUBLIC_ROSTER_CACHE,
);

// An empty source URL is the default for every resident that no page named, so
// it identifies nobody and must never match one of them.
export const getPublicResidentBySource = unstable_cache(
  async (orgId: string, sourceUrl: string) =>
    sourceUrl
      ? prisma.resident.findFirst({
          where: { orgId, sourceUrl, ...PUBLIC_SPONSORABLE_RESIDENT_WHERE },
          select: {
            id: true,
            name: true,
            slug: true,
            sourceUrl: true,
            species: true,
            breed: true,
            ageText: true,
            sex: true,
            photoUrls: true,
            available: true,
            ...ACTIVE_SPONSORSHIP_COUNT,
          },
        })
      : null,
  ["public-resident-by-source"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicResidentBySlug = unstable_cache(
  (orgId: string, slug: string) =>
    prisma.resident.findFirst({
      where: { orgId, slug, ...PUBLIC_SPONSORABLE_RESIDENT_WHERE },
      select: {
        id: true,
        name: true,
        slug: true,
        sourceUrl: true,
        species: true,
        breed: true,
        ageText: true,
        sex: true,
        photoUrls: true,
        available: true,
        ...ACTIVE_SPONSORSHIP_COUNT,
      },
    }),
  ["public-resident-by-slug"],
  PUBLIC_ROSTER_CACHE,
);

export const getPublicCompanionParams = unstable_cache(
  () =>
    prisma.resident.findMany({
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
