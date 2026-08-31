import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    usernameClient({
      displayUsername: false,
    }),
    organizationClient(),
  ],
});
