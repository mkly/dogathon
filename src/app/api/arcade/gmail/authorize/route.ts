import { gmailAuthorizeUrl } from "@/lib/arcade";
import { requireApiSession } from "@/lib/auth-session";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession(request.headers);
  if (unauthorized) return unauthorized;

  const authorization = await gmailAuthorizeUrl();
  const url = typeof authorization === "string"
    ? authorization
    : authorization && "url" in authorization && typeof authorization.url === "string"
      ? authorization.url
      : null;

  return Response.json({ url });
}
