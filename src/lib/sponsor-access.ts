import type { Sponsor } from "@/generated/prisma/client";
import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

type SponsorSession = {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
  };
};

export interface SponsorAccessStore {
  findLinkedSponsor(userId: string): Promise<Sponsor | null>;
  claimSponsor(email: string, userId: string): Promise<Sponsor | null>;
}

type SponsorAccessDependencies = {
  getSession(requestHeaders: Headers): Promise<SponsorSession | null>;
  store: SponsorAccessStore;
};

const prismaSponsorAccessStore: SponsorAccessStore = {
  findLinkedSponsor(userId) {
    return prisma.sponsor.findUnique({ where: { userId } });
  },

  async claimSponsor(email, userId) {
    return prisma.$transaction(async (tx) => {
      const linkedSponsor = await tx.sponsor.findUnique({ where: { userId } });
      if (linkedSponsor) return linkedSponsor;

      await tx.sponsor.updateMany({
        where: { email, userId: null },
        data: { userId },
      });

      return tx.sponsor.findUnique({ where: { userId } });
    });
  },
};

const defaultDependencies: SponsorAccessDependencies = {
  getSession,
  store: prismaSponsorAccessStore,
};

export async function getSponsorContext(
  requestHeaders: Headers,
  dependencies: SponsorAccessDependencies = defaultDependencies,
): Promise<Sponsor | null> {
  const session = await dependencies.getSession(requestHeaders);
  if (!session) return null;

  const linkedSponsor = await dependencies.store.findLinkedSponsor(
    session.user.id,
  );
  if (linkedSponsor) return linkedSponsor;
  if (!session.user.emailVerified) return null;

  return dependencies.store.claimSponsor(
    session.user.email.trim().toLowerCase(),
    session.user.id,
  );
}
