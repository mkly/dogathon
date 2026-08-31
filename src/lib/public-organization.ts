import { prisma } from "@/lib/prisma";

export async function getPublicOrganization() {
  return prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
}
