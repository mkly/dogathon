import { isIP } from "node:net";

const PRIVATE_HOST_SUFFIXES = [".internal", ".lan", ".local", ".localhost"];

export function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const hostname = url.hostname
    .replace(/^\[|\]$/gu, "")
    .toLowerCase()
    .replace(/\.$/u, "");
  if (!hostname || isIP(hostname) !== 0) return false;
  if (
    hostname === "localhost" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return false;
  }

  // Single-label names resolve only through a caller's private DNS search path.
  return hostname.includes(".");
}
