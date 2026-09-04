export type SearchParams = Record<string, string | string[] | undefined>;

export function staffOrganizationsPath(searchParams: SearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }

  const serialized = query.toString();
  return `/staff/organizations${serialized ? `?${serialized}` : ""}`;
}

export function staffOrganizationsSignInPath(searchParams: SearchParams) {
  return `/staff/sign-in?next=${encodeURIComponent(staffOrganizationsPath(searchParams))}`;
}
