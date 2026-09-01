import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const ORGANIZATION_ROLES = ["owner", "admin", "member", "volunteer"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export type OrganizationContext = {
  orgId: string;
  role: OrganizationRole;
  userId: string;
};

type SessionLike = {
  session: { activeOrganizationId?: string | null };
  user: { id: string };
};

type MembershipLike = {
  organizationId: string;
  role: string;
  userId: string;
};

type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

export type OrganizationSlugAccess = {
  authenticated: boolean;
  context: OrganizationContext | null;
  organization: OrganizationSummary;
};

export function authorizeOrganizationId(
  session: SessionLike | null,
  membership: MembershipLike | null,
  orgId: string,
  allowedRoles: readonly OrganizationRole[] = ORGANIZATION_ROLES,
): OrganizationContext | null {
  if (!session || !membership) return null;
  if (membership.organizationId !== orgId || membership.userId !== session.user.id) return null;
  if (!ORGANIZATION_ROLES.includes(membership.role as OrganizationRole)) return null;
  if (!allowedRoles.includes(membership.role as OrganizationRole)) return null;
  return { orgId, role: membership.role as OrganizationRole, userId: session.user.id };
}

export function authorizeOrganization(
  session: SessionLike | null,
  membership: MembershipLike | null,
  allowedRoles: readonly OrganizationRole[] = ORGANIZATION_ROLES,
): OrganizationContext | null {
  const orgId = session?.session.activeOrganizationId;
  if (!orgId) return null;
  return authorizeOrganizationId(session, membership, orgId, allowedRoles);
}

export async function getOrganizationAccessBySlug(
  requestHeaders: Headers,
  slug: string,
  allowedRoles: readonly OrganizationRole[] = ORGANIZATION_ROLES,
): Promise<OrganizationSlugAccess | null> {
  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) return null;

  const session = await getSession(requestHeaders);
  if (!session) return { authenticated: false, context: null, organization };

  const membership = await prisma.member.findUnique({
    where: {
      organizationId_userId: { organizationId: organization.id, userId: session.user.id },
    },
    select: { organizationId: true, role: true, userId: true },
  });

  return {
    authenticated: true,
    context: authorizeOrganizationId(session, membership, organization.id, allowedRoles),
    organization,
  };
}

export async function getOrganizationContext(
  requestHeaders: Headers,
  allowedRoles: readonly OrganizationRole[] = ORGANIZATION_ROLES,
): Promise<OrganizationContext | null> {
  const session = await getSession(requestHeaders);
  const orgId = session?.session.activeOrganizationId;
  if (!session || !orgId) return null;

  const membership = await prisma.member.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: session.user.id },
    },
    select: { organizationId: true, role: true, userId: true },
  });

  return authorizeOrganization(session, membership, allowedRoles);
}

export async function requireApiOrganization(
  requestHeaders: Headers,
  allowedRoles: readonly OrganizationRole[] = ORGANIZATION_ROLES,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; context: OrganizationContext }
> {
  const slug = requestHeaders.get("x-organization-slug");
  if (slug) {
    const access = await getOrganizationAccessBySlug(requestHeaders, slug, allowedRoles);
    if (!access?.context) {
      return {
        ok: false,
        response: Response.json({ error: "Organization membership required" }, { status: 403 }),
      };
    }
    return { ok: true, context: access.context };
  }

  const context = await getOrganizationContext(requestHeaders, allowedRoles);
  if (!context) {
    return {
      ok: false,
      response: Response.json({ error: "Organization membership required" }, { status: 403 }),
    };
  }
  return { ok: true, context };
}

export function forOrganization<T extends object>(orgId: string, where?: T): T & { orgId: string } {
  return { ...(where ?? {} as T), orgId };
}
