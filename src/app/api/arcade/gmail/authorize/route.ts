import { gmailAuthorizeUrl } from "@/lib/arcade";

export async function POST() {
  const authorization = await gmailAuthorizeUrl();
  const url = typeof authorization === "string"
    ? authorization
    : authorization && "url" in authorization && typeof authorization.url === "string"
      ? authorization.url
      : null;

  return Response.json({ url });
}
