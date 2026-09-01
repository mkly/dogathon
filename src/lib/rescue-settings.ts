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

// The sync pipeline accepts either a live adoption page or a checked-in capture
// like seed/dogs-page-A.html, so the staff room has to let both through.
function normalizeSourceUrl(raw: string): string | null {
  if (!raw) return null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  }

  // A local capture path: relative, no traversal, and an HTML file.
  if (raw.startsWith("/") || raw.includes("..")) return null;
  if (!/\.html?$/i.test(raw)) return null;
  return raw;
}

export function parseSettingsForm(formData: FormData): ParsedSettingsForm {
  const savesPinnedPostscript = formData.has("pinnedPostscript");
  const savesSourceUrl = formData.has("sourceUrl");

  if (!savesPinnedPostscript && !savesSourceUrl) {
    return { ok: false, message: "No staff setting was provided." };
  }

  const settings: RescueSettingsPatch = {};
  if (savesPinnedPostscript) {
    settings.pinnedPostscript = String(formData.get("pinnedPostscript") ?? "").trim();
  }

  if (!savesSourceUrl) {
    return { ok: true, message: "Email postscript saved.", settings };
  }

  const sourceInput = String(formData.get("sourceUrl") ?? "");
  const sourceUrl = normalizeSourceUrl(sourceInput.trim());
  if (!sourceUrl) {
    return {
      ok: false,
      message: "Enter an http(s) adoption-page URL or a local capture path like seed/dogs-page-A.html.",
    };
  }

  settings.sourceUrl = sourceUrl;
  return {
    ok: true,
    message: "Roster source saved.",
    savedSourceInput: sourceInput,
    settings,
  };
}
