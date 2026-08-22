import { gmailAuthorizeUrl } from "@/lib/arcade";

export async function POST() {
  if (!process.env.ARCADE_API_KEY) {
    return Response.json(
      { error: "Gmail connection is not configured: ARCADE_API_KEY is missing" },
      { status: 503 },
    );
  }

  try {
    const authorization = await gmailAuthorizeUrl();
    const url = typeof authorization === "string"
      ? authorization
      : authorization && "url" in authorization && typeof authorization.url === "string"
        ? authorization.url
        : null;

    if (!url) {
      return Response.json(
        { error: "Arcade did not return a Gmail authorization URL" },
        { status: 502 },
      );
    }

    return Response.json({ url });
  } catch (error) {
    console.error("Gmail authorization failed", error);
    const message = error instanceof Error ? error.message : "Gmail authorization failed";
    const status = message.includes("ARCADE_USER_ID is required") ? 503 : 502;
    return Response.json({ error: message }, { status });
  }
}
