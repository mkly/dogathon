"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth";

import { auth } from "@/lib/auth";
import { organizationSlug } from "@/lib/organization-slug";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export type CreateOrganizationState = { error: string };

function isSlugCollision(error: unknown) {
  if (!(error instanceof APIError)) return false;
  const code = error.body?.code;
  return code === "ORGANIZATION_ALREADY_EXISTS" || code === "ORGANIZATION_SLUG_ALREADY_TAKEN";
}

export async function createOrganization(
  _previousState: CreateOrganizationState,
  formData: FormData,
): Promise<CreateOrganizationState> {
  const requestHeaders = await headers();
  const name = value(formData, "name");
  const slug = organizationSlug(value(formData, "slug"));
  if (!name || !slug) return { error: "Enter a rescue name and a valid organization slug." };

  let organization: Awaited<ReturnType<typeof auth.api.createOrganization>>;
  try {
    organization = await auth.api.createOrganization({ body: { name, slug }, headers: requestHeaders });
  } catch (error) {
    if (isSlugCollision(error)) {
      return { error: "That organization slug is already taken. Choose another slug." };
    }
    return { error: "We could not create that organization. Check the details and try again." };
  }

  redirect(`/${organization.slug}/admin`);
}

export async function setActiveOrganization(formData: FormData) {
  const requestHeaders = await headers();
  const organizationId = value(formData, "organizationId");
  if (!organizationId) redirect("/staff/organizations?error=invalid-organization");

  await auth.api.setActiveOrganization({ body: { organizationId }, headers: requestHeaders });
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!organization) redirect("/staff/organizations?error=invalid-organization");
  redirect(`/${organization.slug}/admin`);
}

export async function acceptOrganizationInvitation(formData: FormData) {
  const requestHeaders = await headers();
  const invitationId = value(formData, "invitationId");
  if (!invitationId) redirect("/staff/organizations?error=invalid-invitation");

  const accepted = await auth.api.acceptInvitation({ body: { invitationId }, headers: requestHeaders });
  await auth.api.setActiveOrganization({
    body: { organizationId: accepted.member.organizationId },
    headers: requestHeaders,
  });
  const organization = await prisma.organization.findUnique({
    where: { id: accepted.member.organizationId },
    select: { slug: true },
  });
  if (!organization) redirect("/staff/organizations?error=invalid-organization");
  redirect(`/${organization.slug}/admin`);
}
