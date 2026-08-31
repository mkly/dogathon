import Arcade from "@arcadeai/arcadejs";

const TOOLS = {
  firecrawlScrape: "Firecrawl.ScrapeUrl",
} as const;

export type DryRunCall = {
  dryRun: true;
  operation: "authorize" | "execute" | "status";
  toolName: (typeof TOOLS)[keyof typeof TOOLS];
  userId: string;
  input: Record<string, unknown>;
};

function userId(user?: string): string {
  return user ?? process.env.ARCADE_USER_ID ?? "dry-run-user";
}

function dryRun(
  operation: DryRunCall["operation"],
  toolName: DryRunCall["toolName"],
  input: Record<string, unknown>,
  user?: string,
): DryRunCall {
  const call = {
    dryRun: true,
    operation,
    toolName,
    userId: userId(user),
    input,
  } as const;

  console.info("Arcade dry run", call);
  return call;
}

function client(): Arcade | null {
  const apiKey = process.env.ARCADE_API_KEY;
  return apiKey ? new Arcade({ apiKey }) : null;
}

function liveUserId(user?: string): string {
  const resolved = user ?? process.env.ARCADE_USER_ID;
  if (!resolved) {
    throw new Error("ARCADE_USER_ID is required when ARCADE_API_KEY is configured");
  }
  return resolved;
}

export async function scrapeUrl(url: string, user?: string) {
  const input = { url, formats: ["html"] };
  const arcade = client();
  if (!arcade) {
    return dryRun("execute", TOOLS.firecrawlScrape, input, user);
  }

  return arcade.tools.execute({
    tool_name: TOOLS.firecrawlScrape,
    input,
    user_id: liveUserId(user),
  });
}
