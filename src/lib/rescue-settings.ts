import { z } from "zod";

export type RescueSettingsPatch = {
  pinnedPostscript?: string;
  sourceUrl?: string;
};

type ParsedSettingsForm =
  | { ok: false; message: string }
  | {
      ok: true;
      message: string;
      savedSourceInput?: string;
      settings: RescueSettingsPatch;
    };

const httpSourceSchema = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).toString());
// A local capture path: no scheme, relative, no traversal, and an HTML file.
const localSourceSchema = z.string()
  .refine((value) => !/^[a-z][a-z0-9+.-]*:/i.test(value))
  .refine((value) => !value.startsWith("/") && !value.includes("..") && /\.html?$/i.test(value));
const sourceSchema = z.union([httpSourceSchema, localSourceSchema]);
const settingsFormSchema = z.object({
  pinnedPostscript: z.string().trim().optional(),
  sourceUrl: z.string().optional(),
});

export function parseSettingsForm(formData: FormData): ParsedSettingsForm {
  const parsed = settingsFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "No staff setting was provided." };
  }
  const savesPinnedPostscript = parsed.data.pinnedPostscript !== undefined;
  const savesSourceUrl = parsed.data.sourceUrl !== undefined;

  if (!savesPinnedPostscript && !savesSourceUrl) {
    return { ok: false, message: "No staff setting was provided." };
  }

  const settings: RescueSettingsPatch = {};
  if (savesPinnedPostscript) {
    settings.pinnedPostscript = parsed.data.pinnedPostscript;
  }

  if (!savesSourceUrl) {
    return { ok: true, message: "Email postscript saved.", settings };
  }

  const sourceInput = parsed.data.sourceUrl ?? "";
  const sourceUrl = sourceSchema.safeParse(sourceInput.trim());
  if (!sourceUrl.success) {
    return {
      ok: false,
      message: "Enter an http(s) adoption-page URL or a local capture path like seed/dogs-page-A.html.",
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
