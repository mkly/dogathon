import { cache } from "react";

import { auth } from "@/lib/auth";

export const getSession = cache(async (requestHeaders: Headers) => {
  return auth.api.getSession({ headers: requestHeaders });
});

export async function requireApiSession(requestHeaders: Headers) {
  const session = await getSession(requestHeaders);

  if (!session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  return null;
}
