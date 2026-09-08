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
};

export const DEFAULT_SPONSORSHIP_MONTHLY_CENTS = 2500;
export const MAX_SPONSORSHIP_TIERS = 6;

export type SponsorshipTierInput = {
  monthlyCents: number;
  description: string;
};

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
      sponsorshipTiers?: SponsorshipTierInput[];
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
  const tierAmounts = formData.getAll("tierMonthlyDollars");
  const tierDescriptions = formData.getAll("tierDescription");
  const savesSponsorshipSettings = tierAmounts.length > 0
    || tierDescriptions.length > 0
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
      tierAmounts.length === 0
      || tierAmounts.length !== tierDescriptions.length
      || parsed.data.allowedOrigins === undefined
    ) {
      return { ok: false, message: "Enter at least one sponsorship tier and the allowed origins." };
    }
    if (tierAmounts.length > MAX_SPONSORSHIP_TIERS) {
      return { ok: false, message: `Enter no more than ${MAX_SPONSORSHIP_TIERS} sponsorship tiers.` };
    }
    const sponsorshipTiers: SponsorshipTierInput[] = [];
    for (let index = 0; index < tierAmounts.length; index += 1) {
      const amount = tierAmounts[index];
      const rawDescription = tierDescriptions[index];
      if (typeof amount !== "string" || typeof rawDescription !== "string") {
        return { ok: false, message: "Enter valid sponsorship tier values." };
      }
      const monthlyCents = parseMonthlyCents(amount);
      if (monthlyCents === null) {
        return { ok: false, message: "Enter tier prices from $1 to $10,000 with at most two decimal places." };
      }
      const description = rawDescription.replace(/\s*(?:\r\n?|\n)\s*/gu, " ").trim();
      if (description.length > 200) {
        return { ok: false, message: "Keep each tier description to 200 characters or fewer." };
      }
      if (/[<>]/u.test(description)) {
        return { ok: false, message: "Tier descriptions must be plain text without markup." };
      }
      sponsorshipTiers.push({ monthlyCents, description });
    }
    const allowedOrigins = parseAllowedOrigins(parsed.data.allowedOrigins);
    if (allowedOrigins === null) {
      return { ok: false, message: "Enter one HTTPS origin per line with no path, query, or wildcard." };
    }
    settings.allowedOrigins = allowedOrigins;
    return {
      ok: true,
      message: "Sponsorship settings saved.",
      settings,
      sponsorshipTiers,
    };
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
