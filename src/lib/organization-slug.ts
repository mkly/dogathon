import { reservedSlugs } from "reserved-slugs";

export {
  organizationSlug,
  organizationSlugWhileTyping,
} from "./organization-slug-client";

import { organizationSlug } from "./organization-slug-client";

export const RESERVED_ORGANIZATION_SLUG_ERROR = "ORGANIZATION_SLUG_RESERVED";

const PROJECT_ONLY_RESERVED_ORGANIZATION_SLUGS = [
  "_next",
  "next",
  "brand",
  "embed.js",
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
  // isReservedOrganizationSlug matches either the raw lowercased input or its
  // slugified form, so the message has to name whichever one collided — and the
  // suggestion always has to be a slug the user can actually submit.
  const lowercased = slug.trim().toLowerCase();
  const normalized = organizationSlug(slug);
  const rejectedSlug = RESERVED_ORGANIZATION_SLUGS.has(lowercased)
    ? lowercased
    : normalized;
  const suggestion = normalized || rejectedSlug;
  return `The URL /${rejectedSlug} is reserved because it is used or may be needed by Dogathon itself (routes like /support, /login, /api). Pick a different slug, for example ${suggestion}-rescue.`;
}

export function isReservedOrganizationSlug(slug: string) {
  const normalized = organizationSlug(slug);
  return (
    RESERVED_ORGANIZATION_SLUGS.has(slug.trim().toLowerCase()) ||
    RESERVED_ORGANIZATION_SLUGS.has(normalized)
  );
}
