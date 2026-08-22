"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

const channels = new Set(["email", "sms", "both"]);

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createSponsorship(formData: FormData) {
  const residentId = text(formData, "residentId");
  const sponsorName = text(formData, "sponsorName");
  const sponsorEmail = text(formData, "sponsorEmail");
  const sponsorPhone = text(formData, "sponsorPhone");
  const channel = text(formData, "channel");
  const dogPath = `/dogs/${encodeURIComponent(residentId)}`;

  if (
    !residentId ||
    !sponsorName ||
    !sponsorEmail.includes("@") ||
    !channels.has(channel) ||
    ((channel === "sms" || channel === "both") && !sponsorPhone)
  ) {
    redirect(`${dogPath}?error=invalid`);
  }

  const resident = await prisma.resident.findUnique({
    where: { id: residentId },
    select: { status: true },
  });

  if (!resident || resident.status !== "available") {
    redirect(`${dogPath}?error=unavailable`);
  }

  await prisma.sponsorship.create({
    data: {
      residentId,
      sponsorName,
      sponsorEmail,
      sponsorPhone: sponsorPhone || null,
      channel: channel as "email" | "sms" | "both",
      monthlyUsd: 25,
      status: "active",
    },
  });

  redirect(`${dogPath}?sponsored=1`);
}
