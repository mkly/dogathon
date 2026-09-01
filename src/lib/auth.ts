import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { organization } from "better-auth/plugins";

import { sendAppEmail } from "@/lib/app-mailer";
import { prisma } from "@/lib/prisma";

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
      creatorRole: "owner",
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
