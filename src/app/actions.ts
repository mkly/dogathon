"use server";

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createSponsorship(formData: FormData) {
  const residentId = text(formData, "residentId");
  const orgSlug = text(formData, "orgSlug");
  const sponsorName = text(formData, "sponsorName");
  const sponsorEmail = text(formData, "sponsorEmail");
  const dogPath = `/${encodeURIComponent(orgSlug)}/dogs/${encodeURIComponent(residentId)}`;

  if (!residentId || !orgSlug || !sponsorName || !sponsorEmail.includes("@")) {
    redirect(`${dogPath}?error=invalid`);
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  });
  if (!organization) notFound();

  const resident = await prisma.resident.findFirst({
    where: { id: residentId, orgId: organization.id },
    select: { status: true },
  });

  if (!resident || resident.status !== "available") {
    redirect(`${dogPath}?error=unavailable`);
  }

  await prisma.sponsorship.create({
    data: {
      orgId: organization.id,
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
