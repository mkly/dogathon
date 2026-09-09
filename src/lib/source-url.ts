const TRACKING_PARAMETER =
  /^(?:utm_|_ga(?:_|$)|gclid$|dclid$|fbclid$|msclkid$|mc_[ce]id$)/iu;

/**
 * Produces a stable, network-free identity for a public companion page.
 * Invalid or non-HTTP URLs deliberately have no identity.
 */
export function normalizeSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    const normalized = url.toString().replace(/\?$/u, "");
    return url.pathname === "/"
      ? normalized.replace(/\/(?=[?#]|$)/u, "")
      : normalized;
  } catch {
    return "";
  }
}
