import { auth } from "@/lib/auth";

export async function getSession(requestHeaders: Headers) {
  return auth.api.getSession({ headers: requestHeaders });
}

export async function requireApiSession(requestHeaders: Headers) {
  const session = await getSession(requestHeaders);

  if (!session) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  return null;
}
