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
import { sendMagicLinkEmail } from "@/lib/magic-link-email";
import {
  isReservedOrganizationSlug,
  RESERVED_ORGANIZATION_SLUG_ERROR,
  RESERVED_ORGANIZATION_SLUG_MESSAGE,
} from "@/lib/organization-slug";
import { prisma } from "@/lib/prisma";

const organizationAccessControl = createAccessControl(defaultStatements);
const volunteerAc = organizationAccessControl.newRole({});

function rejectReservedOrganizationSlug(slug: string | undefined) {
  if (slug && isReservedOrganizationSlug(slug)) {
    throw new APIError("BAD_REQUEST", {
      code: RESERVED_ORGANIZATION_SLUG_ERROR,
      message: RESERVED_ORGANIZATION_SLUG_MESSAGE,
    });
  }
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
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
        owner: ownerAc,
        admin: adminAc,
        member: memberAc,
        volunteer: volunteerAc,
      },
      sendInvitationEmail: async ({ email, id, organization: invitedOrganization, role }) => {
        const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
        const invitationUrl = new URL("/organizations", baseUrl);
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
