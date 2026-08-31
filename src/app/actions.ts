"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createSponsorship(formData: FormData) {
  const residentId = text(formData, "residentId");
  const orgId = text(formData, "orgId");
  const sponsorName = text(formData, "sponsorName");
  const sponsorEmail = text(formData, "sponsorEmail");
  const dogPath = `/dogs/${encodeURIComponent(residentId)}`;

  if (!residentId || !orgId || !sponsorName || !sponsorEmail.includes("@")) {
    redirect(`${dogPath}?error=invalid`);
  }

  const resident = await prisma.resident.findFirst({
    where: { id: residentId, orgId },
    select: { status: true },
  });

  if (!resident || resident.status !== "available") {
    redirect(`${dogPath}?error=unavailable`);
  }

  await prisma.sponsorship.create({
    data: {
      orgId,
      residentId,
      sponsorName,
      sponsorEmail,
      // sign-up is email-only; staff add a phone number by hand when a sponsor asks for texts
      sponsorPhone: null,
      channel: "email",
      monthlyUsd: 25,
      status: "active",
    },
  });

  redirect(`${dogPath}?sponsored=1`);
}
