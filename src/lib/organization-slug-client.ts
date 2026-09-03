import slugify from "slugify";

export function organizationSlug(name: string) {
  return slugify(name, { lower: true, strict: true });
}

// While a slug is being typed by hand, the separator the last keystroke
// produced has to survive it — organizationSlug alone trims it, which makes
// "happy-tails" impossible to type. The field normalizes again on blur.
export function organizationSlugWhileTyping(typed: string) {
  const slug = organizationSlug(typed);
  return slug && /[^a-z0-9]$/.test(typed.toLowerCase()) ? `${slug}-` : slug;
}
