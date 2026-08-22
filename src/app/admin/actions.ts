"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";

export type SettingsState = {
  message: string;
  status: "idle" | "error" | "success";
};

export async function saveSettings(
  _previousState: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const pinnedPostscript = String(formData.get("pinnedPostscript") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return { status: "error", message: "Enter a complete adoption-page URL." };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { status: "error", message: "The source must use http or https." };
  }

  await prisma.rescueSettings.upsert({
    where: { id: "default" },
    update: { pinnedPostscript, sourceUrl: parsedUrl.toString() },
    create: { id: "default", pinnedPostscript, sourceUrl: parsedUrl.toString() },
  });

  revalidatePath("/admin");
  return { status: "success", message: "Staff-room settings saved." };
}
