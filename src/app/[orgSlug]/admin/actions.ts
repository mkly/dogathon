"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

export type SettingsState = {
  message: string;
  status: "idle" | "error" | "success";
};

// The sync pipeline accepts either a live adoption page or a checked-in capture
// like seed/dogs-page-A.html, so the staff room has to let both through.
function normalizeSourceUrl(raw: string): string | null {
  if (!raw) return null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  }

  // A local capture path: relative, no traversal, and an HTML file.
  if (raw.startsWith("/") || raw.includes("..")) return null;
  if (!/\.html?$/i.test(raw)) return null;
  return raw;
}

export async function saveSettings(
  _previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, ["owner", "admin"]);

  if (!access) notFound();
  if (!access.context) redirect("/organizations");
  const { context } = access;

  const pinnedPostscript = String(formData.get("pinnedPostscript") ?? "").trim();
  const sourceUrl = normalizeSourceUrl(String(formData.get("sourceUrl") ?? "").trim());

  if (!sourceUrl) {
    return {
      status: "error",
      message: "Enter an http(s) adoption-page URL or a local capture path like seed/dogs-page-A.html.",
    };
  }

  await prisma.rescueSettings.upsert({
    where: { orgId: context.orgId },
    update: { pinnedPostscript, sourceUrl },
    create: { orgId: context.orgId, pinnedPostscript, sourceUrl },
  });

  revalidatePath(`/${orgSlug}/admin`);
  return { status: "success", message: "Staff-room settings saved." };
}
