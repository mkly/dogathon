import assert from "node:assert/strict";
import test from "node:test";

import type { Sponsor } from "@/generated/prisma/client";

import {
  getSponsorContext,
  type SponsorAccessStore,
} from "./sponsor-access.ts";

function sponsor(overrides: Partial<Sponsor> = {}): Sponsor {
  return {
    id: "sponsor_fixture",
    email: "sponsor@example.com",
    name: "Avery Sponsor",
    userId: "user_fixture",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

function fixture(options: {
  linked?: Sponsor | null;
  claimable?: Sponsor | null;
  emailVerified?: boolean;
} = {}) {
  const claims: Array<{ email: string; userId: string }> = [];
  const store: SponsorAccessStore = {
    async findLinkedSponsor() {
      return options.linked ?? null;
    },
    async claimSponsor(email, userId) {
      claims.push({ email, userId });
      return options.claimable ?? null;
    },
  };

  return {
    claims,
    dependencies: {
      async getSession() {
        return {
          user: {
            id: "user_fixture",
            email: "  Sponsor@Example.COM ",
            emailVerified: options.emailVerified ?? true,
          },
        };
      },
      store,
    },
  };
}

test("returns the Sponsor already linked to the session user", async () => {
  const linked = sponsor();
  const { claims, dependencies } = fixture({ linked });

  assert.equal(await getSponsorContext(new Headers(), dependencies), linked);
  assert.deepEqual(claims, []);
});

test("claims a matching Sponsor for a verified session email", async () => {
  const claimed = sponsor();
  const { claims, dependencies } = fixture({ claimable: claimed });

  assert.equal(await getSponsorContext(new Headers(), dependencies), claimed);
  assert.deepEqual(claims, [{ email: "sponsor@example.com", userId: "user_fixture" }]);
});

test("does not claim a Sponsor for an unverified session email", async () => {
  const { claims, dependencies } = fixture({
    claimable: sponsor(),
    emailVerified: false,
  });

  assert.equal(await getSponsorContext(new Headers(), dependencies), null);
  assert.deepEqual(claims, []);
});
