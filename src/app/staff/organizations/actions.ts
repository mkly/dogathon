"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  organizationSlug,
  RESERVED_ORGANIZATION_SLUG_ERROR,
  RESERVED_ORGANIZATION_SLUG_MESSAGE,
} from "@/lib/organization-slug";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().transform(organizationSlug).pipe(z.string().min(1)),
});
const organizationSelectionSchema = z.object({ organizationId: uuidSchema });
const invitationSelectionSchema = z.object({ invitationId: uuidSchema });

export type CreateOrganizationState = { error: string };

function isSlugCollision(error: unknown) {
  if (!(error instanceof APIError)) return false;
  const code = error.body?.code;
  return code === "ORGANIZATION_ALREADY_EXISTS" || code === "ORGANIZATION_SLUG_ALREADY_TAKEN";
}

function isReservedSlug(error: unknown) {
  return error instanceof APIError && error.body?.code === RESERVED_ORGANIZATION_SLUG_ERROR;
}

export async function createOrganization(
  _previousState: CreateOrganizationState,
  formData: FormData,
): Promise<CreateOrganizationState> {
  const requestHeaders = await headers();
  const input = createOrganizationSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "Enter a rescue name and a valid organization slug." };
  const { name, slug } = input.data;

  let organization: Awaited<ReturnType<typeof auth.api.createOrganization>>;
  try {
    organization = await auth.api.createOrganization({ body: { name, slug }, headers: requestHeaders });
  } catch (error) {
    if (isReservedSlug(error)) return { error: RESERVED_ORGANIZATION_SLUG_MESSAGE };
    if (isSlugCollision(error)) {
      return { error: "That organization slug is already taken. Choose another slug." };
    }
    return { error: "We could not create that organization. Check the details and try again." };
  }

  redirect(`/${organization.slug}/admin`);
}

export async function setActiveOrganization(formData: FormData) {
  const requestHeaders = await headers();
  const input = organizationSelectionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect("/staff/organizations?error=invalid-organization");
  const { organizationId } = input.data;

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
  const input = invitationSelectionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect("/staff/organizations?error=invalid-invitation");
  const { invitationId } = input.data;

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
