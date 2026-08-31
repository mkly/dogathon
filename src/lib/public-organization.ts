import { prisma } from "@/lib/prisma";

export async function getPublicOrganization(slug: string) {
  return prisma.organization.findUnique({ where: { slug } });
}
