import { z } from "zod";

import { uuidSchema } from "@/lib/uuid";

const accountQuerySchema = z.object({
  switched: uuidSchema.optional().catch(undefined),
});

export function sponsorAccountSwitchPath(sponsorshipId: string) {
  return `/account?${new URLSearchParams({ switched: sponsorshipId })}`;
}

export function sponsorAccountSignInPath(accountPath: string) {
  return `/account/sign-in?${new URLSearchParams({ next: accountPath })}`;
}

export function sponsorAccountReturnPath(input: unknown) {
  if (typeof input !== "string") return "/account";

  let url: URL;
  try {
    url = new URL(input, "https://dogathon.invalid");
  } catch {
    return "/account";
  }
  if (
    url.origin !== "https://dogathon.invalid" ||
    url.pathname !== "/account"
  ) {
    return "/account";
  }

  const switched = uuidSchema.safeParse(url.searchParams.get("switched"));
  return switched.success
    ? sponsorAccountSwitchPath(switched.data)
    : "/account";
}

export function switchedSponsorshipId(
  query: Record<string, string | string[] | undefined>,
) {
  return accountQuerySchema.parse(query).switched;
}
