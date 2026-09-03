import slugify from "slugify";

export const RESERVED_ORGANIZATION_SLUG_ERROR = "ORGANIZATION_SLUG_RESERVED";
export const RESERVED_ORGANIZATION_SLUG_MESSAGE = "That slug is reserved. Choose another slug.";

const RESERVED_ORGANIZATION_SLUGS = new Set([
  "_next",
  "account",
  "admin",
  "api",
  "brand",
  "felt",
  "mascot",
  "next",
  "organizations",
  "sign-in",
  "staff",
  "textures",
  "uploads",
]);

export function organizationSlug(name: string) {
  return slugify(name, { lower: true, strict: true });
}

export function isReservedOrganizationSlug(slug: string) {
  const normalized = organizationSlug(slug);
  return (
    RESERVED_ORGANIZATION_SLUGS.has(slug.trim().toLowerCase()) ||
    RESERVED_ORGANIZATION_SLUGS.has(normalized)
  );
}

// While a slug is being typed by hand, the separator the last keystroke
// produced has to survive it — organizationSlug alone trims it, which makes
// "happy-tails" impossible to type. The field normalizes again on blur.
export function organizationSlugWhileTyping(typed: string) {
  const slug = organizationSlug(typed);
  return slug && /[^a-z0-9]$/.test(typed.toLowerCase()) ? `${slug}-` : slug;
}
