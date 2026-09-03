import { reservedSlugs } from "reserved-slugs";

export { organizationSlug, organizationSlugWhileTyping } from "./organization-slug-client";

import { organizationSlug } from "./organization-slug-client";

export const RESERVED_ORGANIZATION_SLUG_ERROR = "ORGANIZATION_SLUG_RESERVED";

const PROJECT_ONLY_RESERVED_ORGANIZATION_SLUGS = [
  "_next",
  "brand",
  "felt",
  "mascot",
  "textures",
  "uploads",
];

const RESERVED_ORGANIZATION_SLUGS = new Set([
  ...reservedSlugs,
  ...PROJECT_ONLY_RESERVED_ORGANIZATION_SLUGS,
]);

export function reservedOrganizationSlugMessage(slug: string) {
  const rejectedSlug = slug.trim().toLowerCase();
  return `The URL /${rejectedSlug} is reserved because it is used or may be needed by Dogathon itself (routes like /support, /login, /api). Pick a different slug, for example ${rejectedSlug}-rescue.`;
}

export function isReservedOrganizationSlug(slug: string) {
  const normalized = organizationSlug(slug);
  return (
    RESERVED_ORGANIZATION_SLUGS.has(slug.trim().toLowerCase()) ||
    RESERVED_ORGANIZATION_SLUGS.has(normalized)
  );
}
