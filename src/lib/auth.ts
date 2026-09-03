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
  isReservedOrganizationSlug,
  RESERVED_ORGANIZATION_SLUG_ERROR,
  RESERVED_ORGANIZATION_SLUG_MESSAGE,
} from "@/lib/organization-slug";
import { prisma } from "@/lib/prisma";

export const organizationStatements = {
  ...defaultStatements,
  pupdate: ["manage"],
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
    pupdate: ["manage"],
    billing: ["manage"],
    settings: ["manage"],
    members: ["manage"],
    roster: ["manage", "contribute"],
    sponsors: ["read"],
  }),
  admin: organizationAccessControl.newRole({
    ...adminAc.statements,
    pupdate: ["manage"],
    billing: [],
    settings: ["manage"],
    members: ["manage"],
    roster: ["manage", "contribute"],
    sponsors: ["read"],
  }),
  member: organizationAccessControl.newRole({
    ...memberAc.statements,
    pupdate: [],
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
    pupdate: [],
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
      message: RESERVED_ORGANIZATION_SLUG_MESSAGE,
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
      sendInvitationEmail: async ({ email, id, organization: invitedOrganization, role }) => {
        const invitationUrl = new URL("/staff/organizations", env.BETTER_AUTH_URL);
        invitationUrl.searchParams.set("invitation", id);

        const describedSend = await sendAppEmail({
          to: email,
          subject: `Join ${invitedOrganization.name} on Dogathon`,
          body: [
            `You've been invited to join ${invitedOrganization.name} on Dogathon as ${role}.`,
            "",
            `Accept the invitation: ${invitationUrl.toString()}`,
          ].join("\n"),
        });

        if (describedSend) {
          console.info(`Dogathon invitation for ${email}: ${invitationUrl.toString()}`);
        }
      },
    }),
  ],
});
