export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    await import("@/lib/env");
  } catch (error) {
    // Next.js reports a rejected register() as an unhandled rejection and keeps
    // serving, so the first request would still be the one to fail. Stop the
    // server instead: a misconfigured deployment must never report itself ready.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
