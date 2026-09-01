import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAccessControl } from "better-auth/plugins/access";
import { username } from "better-auth/plugins";
import { organization } from "better-auth/plugins";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

import { sendAppEmail } from "@/lib/app-mailer";
import { prisma } from "@/lib/prisma";

const organizationAccessControl = createAccessControl(defaultStatements);
const volunteerAc = organizationAccessControl.newRole({});

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
    organization({
      ac: organizationAccessControl,
      creatorRole: "owner",
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
