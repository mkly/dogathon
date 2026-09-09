"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

export async function acceptInvitation(invitationIdInput: string) {
  const invitationId = uuidSchema.safeParse(invitationIdInput);
  if (!invitationId.success) redirect("/staff/invitations/invalid");

  const returnPath = `/staff/invitations/${invitationId.data}`;
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) {
    redirect(`/staff/sign-in?next=${encodeURIComponent(returnPath)}`);
  }

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId.data },
    select: {
      email: true,
      expiresAt: true,
      organization: { select: { id: true, slug: true } },
      status: true,
    },
  });
  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt.getTime() <= Date.now() ||
    invitation.email.trim().toLowerCase() !==
      session.user.email.trim().toLowerCase()
  ) {
    redirect(returnPath);
  }

  let accepted = false;
  try {
    await auth.api.acceptInvitation({
      body: { invitationId: invitationId.data },
      headers: requestHeaders,
    });
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
