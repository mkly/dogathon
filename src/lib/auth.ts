import { betterAuth } from "better-auth/minimal";
import { APIError } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAccessControl } from "better-auth/plugins/access";
import { magicLink, organization, username } from "better-auth/plugins";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

import { sendAppEmail } from "@/lib/app-mailer";
import { env } from "@/lib/env";
import { sendMagicLinkEmail } from "@/lib/magic-link-email";
import {
  organizationInvitationEmail,
  organizationInvitationExpiresInSeconds,
} from "@/lib/organization-invitation-email";
import {
  isReservedOrganizationSlug,
  RESERVED_ORGANIZATION_SLUG_ERROR,
  reservedOrganizationSlugMessage,
} from "@/lib/organization-slug";
import { prisma } from "@/lib/prisma";

export const organizationStatements = {
  ...defaultStatements,
  sponsorUpdate: ["manage"],
  billing: ["manage"],
  settings: ["manage"],
  members: ["manage"],
  roster: ["manage", "contribute"],
  sponsors: ["read"],
} as const;

const organizationAccessControl = createAccessControl(organizationStatements);

export const organizationRoles = {
  owner: organizationAccessControl.newRole({
    ...ownerAc.statements,
    sponsorUpdate: ["manage"],
    billing: ["manage"],
    settings: ["manage"],
    members: ["manage"],
    roster: ["manage", "contribute"],
    sponsors: ["read"],
  }),
  admin: organizationAccessControl.newRole({
    ...adminAc.statements,
    sponsorUpdate: ["manage"],
    billing: [],
    settings: ["manage"],
    members: ["manage"],
    roster: ["manage", "contribute"],
    sponsors: ["read"],
  }),
  member: organizationAccessControl.newRole({
    ...memberAc.statements,
    sponsorUpdate: ["manage"],
    billing: [],
    settings: [],
    members: [],
    roster: ["contribute"],
    sponsors: [],
  }),
  volunteer: organizationAccessControl.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: [],
    sponsorUpdate: [],
    billing: [],
    settings: [],
    members: [],
    roster: ["contribute"],
    sponsors: [],
  }),
};

export type OrganizationPermission = {
  [Resource in keyof typeof organizationStatements]?: Array<
    (typeof organizationStatements)[Resource][number]
  >;
};

function rejectReservedOrganizationSlug(slug: string | undefined) {
  if (slug && isReservedOrganizationSlug(slug)) {
    throw new APIError("BAD_REQUEST", {
      code: RESERVED_ORGANIZATION_SLUG_ERROR,
      message: reservedOrganizationSlugMessage(slug),
    });
  }
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  ...(env.BETTER_AUTH_SECRET ? { secret: env.BETTER_AUTH_SECRET } : {}),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [
    username({
      displayUsername: false,
      immutableUsername: true,
    }),
    magicLink({
      sendMagicLink: (data) => sendMagicLinkEmail(data),
    }),
    organization({
      ac: organizationAccessControl,
      creatorRole: "owner",
      invitationExpiresIn: organizationInvitationExpiresInSeconds,
      organizationHooks: {
        beforeCreateOrganization: async ({ organization: candidate }) => {
          rejectReservedOrganizationSlug(candidate.slug);
        },
        beforeUpdateOrganization: async ({ organization: candidate }) => {
          rejectReservedOrganizationSlug(candidate.slug);
        },
      },
      roles: {
        ...organizationRoles,
      },
      sendInvitationEmail: async ({
        email,
        id,
        inviter,
        organization: invitedOrganization,
        role,
      }) => {
        const message = organizationInvitationEmail({
          baseUrl: env.BETTER_AUTH_URL,
          email,
          id,
          inviterName: inviter.user.name || inviter.user.email,
          organizationName: invitedOrganization.name,
          role,
        });
        const describedSend = await sendAppEmail(message);

        if (describedSend) {
          console.info(`Dogathon invitation for ${email}: ${message.invitationUrl}`);
        }
      },
    }),
  ],
});
