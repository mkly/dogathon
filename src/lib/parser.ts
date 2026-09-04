import * as cheerio from "cheerio";
import * as chrono from "chrono-node";
import { generateText, Output } from "ai";
import { toString } from "mdast-util-to-string";
import { remark } from "remark";
import { z } from "zod";

import { createAiModel, hasAiCredentials } from "./ai-model.ts";

export type CompanionRecord = {
  name: string;
  breed: string;
  dobText: string;
  ageText: string;
  sex: string;
  weightText: string;
  personality: string;
  careNotes: string[];
  photoUrls: string[];
  adopted: boolean;
};

export type ParseCompanionRosterOptions = {
  apiKey?: string;
  deterministic?: boolean;
  fetch?: typeof fetch;
  model?: string;
  baseUrl?: string;
};

const FIELD_NAMES = ["Personality", "Breed", "Age", "Weight", "Sex", "Gender"];
// Listing status labels rescue sites attach to a companion; they are kept as
// care notes because a companion in foster care or in a bonded pair is still
// adoptable, not adopted.
const STATUS_LABELS = [
  ["In a foster home", /\bin\s+(?:a\s+)?foster\s+(?:home|care)\b/iu],
  ["Bonded pair", /\bbonded\s+pair\b/iu],
  ["Adoption pending", /\badoption\s+pending\b/iu],
] as const;

type RosterSection = {
  heading: string;
  text: string;
  careNotes: string[];
  photoUrls: string[];
};

const trimmedString = z.string().catch("").transform((value) => value.trim());
const trimmedStrings = z.array(z.string()).catch([])
  .transform((values) => values.map((value) => value.trim()).filter(Boolean));
const companionRecordSchema = z.object({
  name: trimmedString,
  breed: trimmedString,
  dobText: trimmedString,
  ageText: trimmedString,
  sex: trimmedString,
  weightText: trimmedString,
  personality: trimmedString,
  careNotes: trimmedStrings,
  photoUrls: trimmedStrings,
  adopted: z.boolean().catch(false),
});

/**
 * Parse a hand-authored rescue roster. A configured chat-completions endpoint
 * is the primary parser; local parsing keeps imports, tests, and demos offline.
 */
export async function parseCompanionRoster(
  source: string,
  options: ParseCompanionRosterOptions = {},
): Promise<CompanionRecord[]> {
  if (hasAiCredentials(options.apiKey) && !options.deterministic) {
    try {
      return await parseWithModel(source, options);
    } catch (error) {
      console.warn("Model roster parsing failed; using deterministic parser.", error);
    }
  }

  return parseCompanionRosterDeterministic(source);
}

export function parseCompanionRosterDeterministic(source: string): CompanionRecord[] {
  const sections = source.includes("<h3")
    ? splitHtmlSections(source)
    : markdownSections(source);

  return sections.flatMap(({ heading, text, careNotes, photoUrls }) => {
    const adopted = /\badopted\b/i.test(heading);
    const name = cleanHeading(heading);
    const breed = extractField(text, "Breed");
    const ageText = extractField(text, "Age");
    const sex = extractField(text, "Sex") || extractField(text, "Gender");
    const weightText = extractField(text, "Weight");
    const personality = extractField(text, "Personality");
    const statusNotes = extractStatusNotes(text).filter((note) => !careNotes.includes(note));

    // Navigation and footer headings are not roster entries.
    if (!name || !photoUrls.length || ![breed, ageText, sex, weightText, personality].some(Boolean)) {
      return [];
    }

    return [{
      name,
      breed,
      dobText: extractDob(ageText) ?? "",
      ageText,
      sex,
      weightText,
      personality,
      careNotes: [...careNotes, ...statusNotes],
      photoUrls,
      adopted,
    }];
  });
}

async function parseWithModel(
  source: string,
  options: ParseCompanionRosterOptions,
): Promise<CompanionRecord[]> {
  const { output } = await generateText({
    model: createAiModel(options),
    maxOutputTokens: 12_000,
    output: Output.array({ element: companionRecordSchema }),
    prompt: `Extract the rescue companions from the page below. Each item must have exactly these fields: name, breed, dobText, ageText, sex, weightText, personality, careNotes (string array), photoUrls (string array), and adopted (boolean). Preserve the page's wording. A heading such as "Meet Stripe" names the companion Stripe. Labels such as Gender count as sex. A heading containing an Adopted marker means adopted is true; a companion described as in a foster home, a bonded pair, or adoption pending is still adoptable, so record that status in careNotes rather than marking it adopted. Photos appear as [photo: URL] markers; put the markers nearest a companion's heading, including the ones directly before it on a detail page, in that companion's photoUrls. Do not include navigation, footer, or courtesy-listing headings.\n\n${semanticPageText(source)}`,
  });

  const companions = output.filter((companion) => companion.name && companion.photoUrls.length);
  // An empty roster reads downstream as "every companion was adopted", so treat it as
  // a failed parse and let the deterministic path answer instead.
  if (!companions.length) throw new Error("Model response contained no usable companion records");

  return companions;
}

function splitHtmlSections(source: string): RosterSection[] {
  const $ = cheerio.load(source);
  addTextBoundaries($);

  return $("h3").toArray().map((heading) => {
    const $heading = $(heading);
    const followingSiblings = $heading.nextUntil("h3");
    // Simple imports place the section content directly after the heading; site
    // builders instead wrap each heading and its content in a per-companion card,
    // the outermost ancestor that still covers only this heading.
    const card = $heading.parents().filter((_index, element) => $(element).find("h3").length === 1);
    const section = followingSiblings.length ? followingSiblings : card.length ? card.last() : $heading;
    const images = section.filter("img").add(section.find("img"));

    return {
      heading: cleanText($heading.text()),
      text: cleanText(section.text()),
      careNotes: section.find("li").toArray()
        .map((item) => cleanText($(item).text()))
        .filter(Boolean),
      photoUrls: uniquePhotoUrls(
        images.toArray().map((image) => $(image).attr("src")),
      ),
    };
  });
}

function markdownSections(source: string): RosterSection[] {
  const { preamble, sections } = splitMarkdownSections(source);
  const regions = sections.map(({ heading, body, tail }) => {
    // Bold field labels (**Age:**) read like plain labels once the emphasis goes.
    const text = stripEmphasis(body);
    const tailPhotoUrls = extractMarkdownPhotoUrls(tail);
    return {
      heading,
      text,
      careNotes: extractMarkdownCareNotes(body),
      photoUrls: extractMarkdownPhotoUrls(text),
      tailPhotoUrls,
      hasFields: FIELD_LABEL_PATTERN.test(text),
    };
  });
  // Crawled detail pages arrive joined by thematic breaks, and each page puts its
  // photo gallery above the "Meet ..." heading. So the photos after the last break
  // of a region belong to the next heading when that heading has fields but no
  // photos of its own.
  const inherits = (index: number) => {
    const region = regions[index];
    if (region === undefined || !region.hasFields) return false;
    return region.photoUrls.length === region.tailPhotoUrls.length;
  };
  return regions.map((region, index) => {
    const inherited = inherits(index)
      ? index === 0 ? extractMarkdownPhotoUrls(preamble) : regions[index - 1].tailPhotoUrls
      : [];
    const donated = new Set(inherits(index + 1) ? region.tailPhotoUrls : []);
    return {
      heading: region.heading,
      text: region.text,
      careNotes: region.careNotes,
      photoUrls: uniquePhotoUrls([
        ...inherited,
        ...region.photoUrls.filter((url) => !donated.has(url)),
      ]),
    };
  });
}

const FIELD_LABEL_PATTERN = new RegExp(`\\b(?:${FIELD_NAMES.join("|")})\\s*:`, "iu");

function stripEmphasis(markdown: string): string {
  return markdown.replace(/\*\*/gu, "");
}

function splitMarkdownSections(
  source: string,
): { preamble: string; sections: Array<{ heading: string; body: string; tail: string }> } {
  const tree = remark().parse(source);
  const headings: Array<{ heading: string; start: number; end: number }> = [];
  const breaks: number[] = [];
  for (const node of tree.children) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    if (node.type === "heading") headings.push({ heading: toString(node), start, end });
    if (node.type === "thematicBreak") breaks.push(end);
  }

  return {
    preamble: source.slice(0, headings[0]?.start ?? source.length),
    sections: headings.map((heading, index) => {
      const end = headings[index + 1]?.start ?? source.length;
      // The tail is whatever follows the last thematic break inside the section:
      // the start of the next crawled document.
      const lastBreak = breaks.filter((offset) => offset > heading.end && offset <= end).at(-1);
      return {
        heading: heading.heading,
        body: source.slice(heading.end, end),
        tail: lastBreak === undefined ? "" : source.slice(lastBreak, end),
      };
    }),
  };
}

function extractField(text: string, field: string): string {
  const following = FIELD_NAMES.filter((name) => name !== field).join("|");
  const pattern = new RegExp(
    `(?:^|\\n|\\s)${field}\\s*:\\s*(.*?)(?=\\s*(?:${following})\\s*:|\\n|$)`,
    "i",
  );
  return cleanText(text.match(pattern)?.[1] ?? "");
}

function extractDob(ageText: string): string | null {
  const date = chrono.parseDate(ageText);
  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractMarkdownCareNotes(body: string): string[] {
  return [...body.matchAll(/^\s*[-*]\s+(.+)$/gm)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function extractMarkdownPhotoUrls(body: string): string[] {
  const urls = body.match(/https?:\/\/[^"'\s<>]+?\.(?:avif|gif|jpe?g|png|webp)(?:\?[^"'\s<>]*)?/gi) ?? [];
  return uniquePhotoUrls(urls);
}

function extractStatusNotes(text: string): string[] {
  return STATUS_LABELS.flatMap(([label, pattern]) => pattern.test(text) ? [label] : []);
}

function cleanHeading(heading: string): string {
  return cleanText(
    heading
      .replace(/\s*\*?\s*adopted\b.*$/i, "")
      .replace(/^\s*meet\s+/i, ""),
  );
}

// Markdown images (Firecrawl's scrape output) become the same [photo: URL]
// markers the model prompt describes for HTML <img> tags.
function markdownImagesToMarkers(source: string): string {
  return source.replace(
    /!\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/gu,
    (match, url: string) => {
      const src = normalizePhotoUrl(url);
      return src ? `\n[photo: ${src}]\n` : match;
    },
  );
}

function semanticPageText(source: string): string {
  const $ = cheerio.load(markdownImagesToMarkers(source));
  $("script, style, noscript").remove();
  $("img").each((_index, image) => {
    const src = normalizePhotoUrl($(image).attr("src"));
    $(image).replaceWith(src ? `\n[photo: ${src}]\n` : " ");
  });
  addTextBoundaries($);
  return cleanText($("body").text()).slice(0, 180_000);
}

function cleanText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    // Cheerio decodes &nbsp; to U+00A0; roster text treats it as an ordinary space.
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function addTextBoundaries($: cheerio.CheerioAPI): void {
  $("br").replaceWith("\n");
  $("p, li, h1, h2, h3, h4, h5, h6").append("\n");
}

function uniquePhotoUrls(urls: Array<string | undefined>): string[] {
  return [...new Set(urls.map(normalizePhotoUrl).filter((url): url is string => Boolean(url)))];
}

function normalizePhotoUrl(url: string | undefined): string | undefined {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  const withoutQuery = url.split("?")[0];
  return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(withoutQuery) ? withoutQuery : undefined;
}
