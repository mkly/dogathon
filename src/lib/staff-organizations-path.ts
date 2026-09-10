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

export const AUTHORIZED_STAFF_ROLES = ["owner", "admin", "member"] as const;
export type AuthorizedStaffRole = (typeof AUTHORIZED_STAFF_ROLES)[number];
const ORGANIZATION_MEMBERSHIP_ROLES = [
  ...AUTHORIZED_STAFF_ROLES,
  "volunteer",
] as const;

export function isAuthorizedStaffMembership(role: string): boolean {
  return (AUTHORIZED_STAFF_ROLES as readonly string[]).includes(role);
}

function isOrganizationMembership(role: string): boolean {
  return (ORGANIZATION_MEMBERSHIP_ROLES as readonly string[]).includes(role);
}

export function sanitizeStaffSignInNext(candidate: unknown): string | null {
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\")
  ) {
    return null;
  }
  if (/[\r\n\t]/.test(trimmed)) {
    return null;
  }
  const pathname = trimmed.split("?")[0].split("#")[0];
  if (pathname === "/staff/sign-in") {
    return null;
  }
  return trimmed;
}

export function isDefaultStaffDestination(
  path: string | null | undefined,
): boolean {
  if (!path) return true;
  const pathname = path.split("?")[0].split("#")[0];
  return (
    pathname === "/staff/organizations" || pathname === "/staff/organizations/"
  );
}

export function extractOrgSlugFromPath(path: string): string | null {
  const pathname = path.split("?")[0].split("#")[0];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const [first, second] = segments;
  if (
    first === "staff" ||
    first === "account" ||
    first === "api" ||
    first === "embed.js"
  ) {
    return null;
  }
  if (second === "admin" || second === "volunteer") {
    return first;
  }
  return null;
}

export type StaffOrganizationMembership = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type StaffSignInDependencies = {
  findOrganizations: (userId: string) => Promise<StaffOrganizationMembership[]>;
  setActiveOrganization: (
    organizationId: string,
    requestHeaders: Headers,
  ) => Promise<void>;
};

export const defaultStaffSignInDependencies: StaffSignInDependencies = {
  findOrganizations: async (userId: string) => {
    const { prisma } = await import("@/lib/prisma");
    const members = await prisma.member.findMany({
      where: { userId },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return members
      .filter((m) => isOrganizationMembership(m.role))
      .map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
      }));
  },
  setActiveOrganization: async (
    organizationId: string,
    requestHeaders: Headers,
  ) => {
    const { auth } = await import("@/lib/auth");
    await auth.api.setActiveOrganization({
      body: { organizationId },
      headers: requestHeaders,
    });
  },
};

export async function resolveStaffSignInDestination(
  requestHeaders: Headers,
  userId: string,
  candidateNext?: unknown,
  dependencies: StaffSignInDependencies = defaultStaffSignInDependencies,
): Promise<string> {
  const safeNext = sanitizeStaffSignInNext(candidateNext);
  const organizations = await dependencies.findOrganizations(userId);
  const authorizedStaffOrganizations = organizations.filter((organization) =>
    isAuthorizedStaffMembership(organization.role),
  );

  if (safeNext && !isDefaultStaffDestination(safeNext)) {
    const targetOrgSlug = extractOrgSlugFromPath(safeNext);
    if (targetOrgSlug) {
      const matchingOrg = organizations.find(
        (org) => org.slug === targetOrgSlug,
      );
      const targetArea = safeNext.split("?")[0].split("#")[0].split("/")[2];
      const authorizedForTarget =
        matchingOrg &&
        (targetArea === "volunteer"
          ? isOrganizationMembership(matchingOrg.role)
          : isAuthorizedStaffMembership(matchingOrg.role));
      if (matchingOrg && authorizedForTarget) {
        await dependencies.setActiveOrganization(
          matchingOrg.id,
          requestHeaders,
        );
        return safeNext;
      }
      // If user lacks authorization for the requested org room, fall back to default
      // sign-in behavior to prevent redirect loops.
    } else {
      return safeNext;
    }
  }

  if (authorizedStaffOrganizations.length === 1) {
    const singleOrg = authorizedStaffOrganizations[0];
    await dependencies.setActiveOrganization(singleOrg.id, requestHeaders);
    return `/${singleOrg.slug}/admin`;
  }

  return "/staff/organizations";
}
