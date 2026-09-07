import { z } from "zod";

import { neutralizeUnsafeMarkdownDestinations } from "./markdown-safety.ts";
import {
  POSTSCRIPT_MAX_LENGTH,
  postscriptOverLimitMessage,
} from "./postscript.ts";
import { isPublicHttpUrl } from "./public-http-url.ts";

export type RescueSettingsPatch = {
  allowedOrigins?: string[];
  pinnedPostscript?: string;
  sourceUrl?: string;
  sponsorshipMonthlyCents?: number;
};

export const DEFAULT_SPONSORSHIP_MONTHLY_CENTS = 2500;

export type OriginSettings = { allowedOrigins: string[] };

export function isAllowedOrigin(settings: OriginSettings, origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
    return settings.allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

type ParsedSettingsForm =
  | { ok: false; message: string }
  | {
      ok: true;
      message: string;
      savedSourceInput?: string;
      settings: RescueSettingsPatch;
    };

const httpSourceSchema = z.url({ protocol: /^https?$/ })
  .refine(isPublicHttpUrl)
  .transform((value) => new URL(value).toString());
// A local capture path: no scheme, relative, no traversal, and an HTML file.
const localSourceSchema = z.string()
  .refine((value) => !/^[a-z][a-z0-9+.-]*:/i.test(value))
  .refine((value) => !value.startsWith("/") && !value.includes("..") && /\.html?$/i.test(value));
const sourceSchema = z.union([httpSourceSchema, localSourceSchema]);
const settingsFormSchema = z.object({
  allowedOrigins: z.string().optional(),
  pinnedPostscript: z.string().optional(),
  sourceUrl: z.string().optional(),
  sponsorshipMonthlyDollars: z.string().optional(),
});

function parseMonthlyCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) return null;
  const [dollars, cents = ""] = normalized.split(".");
  const amount = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= 100 && amount <= 1_000_000 ? amount : null;
}

export function parseAllowedOrigins(value: string, production = process.env.NODE_ENV === "production") {
  const origins: string[] = [];
  for (const input of value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    const localhost = url.hostname === "localhost" || url.hostname.endsWith(".localhost");
    if (
      url.username
      || url.password
      || url.hostname.includes("*")
      || (url.pathname !== "/" && url.pathname !== "")
      || url.search
      || url.hash
      || (url.protocol !== "https:" && !(localhost && !production && url.protocol === "http:"))
      || (localhost && production)
    ) {
      return null;
    }
    if (!origins.includes(url.origin)) origins.push(url.origin);
  }
  return origins;
}

export function parseSettingsForm(formData: FormData): ParsedSettingsForm {
  const parsed = settingsFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "No staff setting was provided." };
  }
  const savesPinnedPostscript = parsed.data.pinnedPostscript !== undefined;
  const savesSourceUrl = parsed.data.sourceUrl !== undefined;
  const savesSponsorshipSettings = parsed.data.sponsorshipMonthlyDollars !== undefined
    || parsed.data.allowedOrigins !== undefined;

  if (!savesPinnedPostscript && !savesSourceUrl && !savesSponsorshipSettings) {
    return { ok: false, message: "No staff setting was provided." };
  }

  const settings: RescueSettingsPatch = {};
  if (savesPinnedPostscript) {
    const pinnedPostscript = (parsed.data.pinnedPostscript ?? "")
      .replace(/\r\n?/gu, "\n")
      .trim();
    if (pinnedPostscript.length > POSTSCRIPT_MAX_LENGTH) {
      return { ok: false, message: postscriptOverLimitMessage() };
    }
    settings.pinnedPostscript = neutralizeUnsafeMarkdownDestinations(pinnedPostscript);
  }

  if (savesSponsorshipSettings) {
    if (
      parsed.data.sponsorshipMonthlyDollars === undefined
      || parsed.data.allowedOrigins === undefined
    ) {
      return { ok: false, message: "Enter both a monthly price and the allowed origins." };
    }
    const sponsorshipMonthlyCents = parseMonthlyCents(parsed.data.sponsorshipMonthlyDollars);
    if (sponsorshipMonthlyCents === null) {
      return { ok: false, message: "Enter a monthly price from $1 to $10,000 with at most two decimal places." };
    }
    const allowedOrigins = parseAllowedOrigins(parsed.data.allowedOrigins);
    if (allowedOrigins === null) {
      return { ok: false, message: "Enter one HTTPS origin per line with no path, query, or wildcard." };
    }
    settings.sponsorshipMonthlyCents = sponsorshipMonthlyCents;
    settings.allowedOrigins = allowedOrigins;
  }

  if (!savesSourceUrl) {
    return {
      ok: true,
      message: savesSponsorshipSettings ? "Sponsorship settings saved." : "Email postscript saved.",
      settings,
    };
  }

  const sourceInput = parsed.data.sourceUrl ?? "";
  const sourceUrl = sourceSchema.safeParse(sourceInput.trim());
  if (!sourceUrl.success) {
    return {
      ok: false,
      message: "Enter a public http(s) adoption-page URL or a local capture path like seed/dogs-page-A.html.",
    };
  }

  settings.sourceUrl = sourceUrl.data;
  return {
    ok: true,
    message: "Roster source saved.",
    savedSourceInput: sourceInput,
    settings,
  };
}
