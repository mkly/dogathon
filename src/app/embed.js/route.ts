import { sponsorEmbedScript } from "@/lib/sponsor-embed-script";

export const dynamic = "force-static";

export function GET() {
  return new Response(sponsorEmbedScript, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/javascript; charset=utf-8",
    },
  });
}
