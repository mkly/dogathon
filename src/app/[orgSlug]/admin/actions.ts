"use server";

import { refresh, revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { revalidatePublicRoster } from "@/lib/public-roster-cache";
import {
  parseAllowedOriginsForm,
  parseSettingsForm,
  parseSponsorshipTiersForm,
} from "@/lib/rescue-settings";
import {
  markResidentAdopted as retireAdoptedResident,
} from "@/lib/roster-sync";
import { createConnectOnboardingLink, refreshConnectStatus } from "@/lib/stripe-billing";

export type SettingsState = {
  message: string;
  savedSourceInput?: string;
  status: "idle" | "error" | "success";
};
const organizationFormSchema = z.object({ orgSlug: z.string().trim().min(1) });
const residentFormSchema = organizationFormSchema.extend({ residentId: z.string().trim().min(1) });

export async function refreshAdminPage() {
  refresh();
}

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

/**
 * Staff mark a companion adopted by hand when the roster never carried the
 * marker. Each active sponsorship gets an adoption notice draft in the staff
 * room queue; sponsorship and billing state remain unchanged until approval.
 */
export async function markResidentAdopted(formData: FormData) {
  const input = residentFormSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) notFound();
  const { orgSlug, residentId } = input.data;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    sponsorUpdate: ["manage"],
  });

  if (!access) notFound();
  if (!access.context) redirect("/staff/organizations");
  const { orgId } = access.context;

  const { name, drafted } = await prisma.$transaction(async (tx) => {
    const resident = await tx.resident.findUnique({
      where: { id_orgId: { id: residentId, orgId } },
      select: { id: true, name: true, available: true },
    });
    if (!resident) notFound();
    if (!resident.available) {
      throw new Error(`${resident.name} is already marked unavailable.`);
    }
    const drafted = await retireAdoptedResident(tx, orgId, resident);
    return {
      name: resident.name,
      drafted,
    };
  });
  revalidatePublicRoster();
  revalidatePath(`/${orgSlug}/admin`);
  revalidatePath(`/${orgSlug}/admin/companions-covered`);
  return { name, drafted };
}

export async function refreshStripeConnection(formData: FormData) {
  const input = organizationFormSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) notFound();
  const { orgSlug } = input.data;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    billing: ["manage"],
  });

  if (!access) notFound();
  if (!access.context) redirect("/staff/organizations");

  await refreshConnectStatus(access.context.orgId);
  revalidatePath(`/${orgSlug}/admin/settings`);
}

async function requireSettingsAccess(formData: FormData) {
  const input = organizationFormSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) notFound();
  const { orgSlug } = input.data;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    settings: ["manage"],
  });
  if (!access) notFound();
  if (!access.context) redirect("/staff/organizations");
  return { orgSlug, orgId: access.context.orgId };
}

export async function saveSettings(
  previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { orgId, orgSlug } = await requireSettingsAccess(formData);

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
    where: { orgId },
    update: parsed.settings,
    create: { orgId, ...parsed.settings },
  });

  revalidatePublicRoster();
  revalidatePath(`/${orgSlug}/admin/settings`);
  return {
    status: "success",
    message: parsed.message,
    ...(parsed.savedSourceInput ? { savedSourceInput: parsed.savedSourceInput } : {}),
  };
}

export async function saveSponsorshipTiers(
  _previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { orgId, orgSlug } = await requireSettingsAccess(formData);
  const parsed = parseSponsorshipTiersForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  await prisma.$transaction(async (tx) => {
    await tx.sponsorshipTier.deleteMany({ where: { orgId } });
    await tx.sponsorshipTier.createMany({
      data: parsed.sponsorshipTiers.map((tier, position) => ({ ...tier, orgId, position })),
    });
  });
  revalidatePublicRoster();
  revalidatePath(`/${orgSlug}/admin/settings`);
  return { status: "success", message: parsed.message };
}

export async function saveAllowedOrigins(
  _previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { orgId, orgSlug } = await requireSettingsAccess(formData);
  const parsed = parseAllowedOriginsForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  await prisma.rescueSettings.upsert({
    where: { orgId },
    update: { allowedOrigins: parsed.allowedOrigins },
    create: { orgId, allowedOrigins: parsed.allowedOrigins },
  });
  revalidatePublicRoster();
  revalidatePath(`/${orgSlug}/admin/settings`);
  return { status: "success", message: parsed.message };
}
