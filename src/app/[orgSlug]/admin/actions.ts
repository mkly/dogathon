"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { parseSettingsForm } from "@/lib/rescue-settings";
import { createConnectOnboardingLink } from "@/lib/stripe-billing";

export type SettingsState = {
  message: string;
  savedSourceInput?: string;
  status: "idle" | "error" | "success";
};
const organizationFormSchema = z.object({ orgSlug: z.string().trim().min(1) });

export async function beginStripeOnboarding(formData: FormData) {
  const input = organizationFormSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) notFound();
  const { orgSlug } = input.data;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    billing: ["manage"],
  });

  if (!access) notFound();
  if (!access.context) redirect("/staff/organizations");

  // Stripe sends the owner back to a bare API route, so the org has to ride along
  // in the URL for the callback to know which admin room to return them to.
  const org = `?org=${encodeURIComponent(orgSlug)}`;
  const link = await createConnectOnboardingLink(access.context.orgId, {
    refreshUrl: `${env.BETTER_AUTH_URL}/api/stripe/connect/refresh${org}`,
    returnUrl: `${env.BETTER_AUTH_URL}/api/stripe/connect/return${org}`,
  });
  redirect(link.url);
}

export async function saveSettings(
  previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const input = organizationFormSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) notFound();
  const { orgSlug } = input.data;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    settings: ["manage"],
  });

  if (!access) notFound();
  if (!access.context) redirect("/staff/organizations");
  const { context } = access;

  const parsed = parseSettingsForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: parsed.message,
      ...(previousState.savedSourceInput
        ? { savedSourceInput: previousState.savedSourceInput }
        : {}),
    };
  }

  await prisma.rescueSettings.upsert({
    where: { orgId: context.orgId },
    update: parsed.settings,
    create: { orgId: context.orgId, ...parsed.settings },
  });

  revalidatePath(`/${orgSlug}/admin/settings`);
  return {
    status: "success",
    message: parsed.message,
    ...(parsed.savedSourceInput ? { savedSourceInput: parsed.savedSourceInput } : {}),
  };
}
