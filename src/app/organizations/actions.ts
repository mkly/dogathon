"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getOrganizationContext } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createOrganization(formData: FormData) {
  const requestHeaders = await headers();
  const name = value(formData, "name");
  const slug = value(formData, "slug").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  if (!name || !slug) redirect("/organizations?error=invalid-organization");

  let organization;
  try {
    organization = await auth.api.createOrganization({
      body: { name, slug },
      headers: requestHeaders,
    });
  } catch {
    redirect("/organizations?error=create-failed");
  }

  redirect(`/${organization.slug}/admin`);
}

export async function setActiveOrganization(formData: FormData) {
  const requestHeaders = await headers();
  const organizationId = value(formData, "organizationId");
  if (!organizationId) redirect("/organizations?error=invalid-organization");

  await auth.api.setActiveOrganization({ body: { organizationId }, headers: requestHeaders });
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!organization) redirect("/organizations?error=invalid-organization");
  redirect(`/${organization.slug}/admin`);
}

export async function inviteOrganizationMember(formData: FormData) {
  const requestHeaders = await headers();
  const context = await getOrganizationContext(requestHeaders, ["owner", "admin"]);
  if (!context) redirect("/organizations?error=forbidden");

  const email = value(formData, "email").toLowerCase();
  const requestedRole = value(formData, "role");
  const role = requestedRole === "admin" ? "admin" : "member";
  if (!email.includes("@")) redirect("/organizations?error=invalid-email");

  await auth.api.createInvitation({
    body: { email, role, organizationId: context.orgId },
    headers: requestHeaders,
  });
  redirect("/organizations?invited=1");
}

export async function acceptOrganizationInvitation(formData: FormData) {
  const requestHeaders = await headers();
  const invitationId = value(formData, "invitationId");
  if (!invitationId) redirect("/organizations?error=invalid-invitation");

  const accepted = await auth.api.acceptInvitation({ body: { invitationId }, headers: requestHeaders });
  await auth.api.setActiveOrganization({
    body: { organizationId: accepted.member.organizationId },
    headers: requestHeaders,
  });
  const organization = await prisma.organization.findUnique({
    where: { id: accepted.member.organizationId },
    select: { slug: true },
  });
  if (!organization) redirect("/organizations?error=invalid-organization");
  redirect(`/${organization.slug}/admin`);
}
