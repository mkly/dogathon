import { cache } from "react";

import { auth } from "@/lib/auth";

export const getSession = cache(async (requestHeaders: Headers) => {
  return auth.api.getSession({ headers: requestHeaders });
});
