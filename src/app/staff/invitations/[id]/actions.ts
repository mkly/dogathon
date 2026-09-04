"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

const invitationSelectionSchema = z.object({ invitationId: uuidSchema });

export async function acceptInvitation(formData: FormData) {
  const input = invitationSelectionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect("/staff/invitations/invalid");

  const { invitationId } = input.data;
  const returnPath = `/staff/invitations/${invitationId}`;
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) {
    redirect(`/staff/sign-in?next=${encodeURIComponent(returnPath)}`);
  }

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: {
      email: true,
      expiresAt: true,
      organization: { select: { id: true, slug: true } },
      status: true,
    },
  });
  if (
    !invitation
    || invitation.status !== "pending"
    || invitation.expiresAt.getTime() <= Date.now()
    || invitation.email.trim().toLowerCase() !== session.user.email.trim().toLowerCase()
  ) {
    redirect(returnPath);
  }

  let accepted = false;
  try {
    await auth.api.acceptInvitation({ body: { invitationId }, headers: requestHeaders });
    accepted = true;
  } catch {
    // A concurrent accept, cancellation, or expiry is reflected by the landing page.
  }
  if (!accepted) redirect(returnPath);

  await auth.api.setActiveOrganization({
    body: { organizationId: invitation.organization.id },
    headers: requestHeaders,
  });
  redirect(`/${invitation.organization.slug}/admin`);
}
