import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { organization } from "better-auth/plugins";

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

        const webhook = process.env.INVITATION_EMAIL_WEBHOOK_URL;
        if (webhook) {
          const response = await fetch(webhook, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              to: email,
              subject: `Join ${invitedOrganization.name} on Dogathon`,
              invitationUrl: invitationUrl.toString(),
              role,
            }),
          });
          if (!response.ok) throw new Error(`Invitation email webhook failed (${response.status})`);
          return;
        }

        console.info(`Dogathon invitation for ${email}: ${invitationUrl.toString()}`);
      },
    }),
  ],
});
