"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth-session";
import { resolveStaffSignInDestination } from "@/lib/staff-organizations-path";

export async function completeStaffSignIn(rawNext?: string) {
  const requestHeaders = await headers();
  const session = await getSession(requestHeaders);
  if (!session) {
    redirect("/staff/sign-in");
  }

  const destination = await resolveStaffSignInDestination(
    requestHeaders,
    session.user.id,
    rawNext,
  );
  redirect(destination);
}
