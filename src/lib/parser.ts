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

const FIELD_NAMES = ["Personality", "Breed", "Age", "Weight", "Sex"];

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
    : splitMarkdownSections(source).map(({ heading, body }) => ({
        heading,
        text: body,
        careNotes: extractMarkdownCareNotes(body),
        photoUrls: extractMarkdownPhotoUrls(body),
      }));

  return sections.flatMap(({ heading, text, careNotes, photoUrls }) => {
    const adopted = /\badopted\b/i.test(heading);
    const name = cleanHeading(heading);
    const breed = extractField(text, "Breed");
    const ageText = extractField(text, "Age");
    const sex = extractField(text, "Sex");
    const weightText = extractField(text, "Weight");
    const personality = extractField(text, "Personality");

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
      careNotes,
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
    prompt: `Extract the rescue companions from the page below. Each item must have exactly these fields: name, breed, dobText, ageText, sex, weightText, personality, careNotes (string array), photoUrls (string array), and adopted (boolean). Preserve the page's wording. A heading containing an Adopted marker means adopted is true. Photos appear as [photo: URL] markers; put the markers that follow a companion's heading in that companion's photoUrls. Do not include navigation, footer, or courtesy-listing headings.\n\n${semanticPageText(source)}`,
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

function splitMarkdownSections(source: string): Array<{ heading: string; body: string }> {
  const tree = remark().parse(source);
  const headings = tree.children.flatMap((node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;

    return node.type === "heading" && start !== undefined && end !== undefined
      ? [{ heading: toString(node), start, end }]
      : [];
  });

  return headings.map((heading, index) => ({
    heading: heading.heading,
    body: source.slice(
      heading.end,
      headings[index + 1]?.start ?? source.length,
    ),
  }));
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

function cleanHeading(heading: string): string {
  return cleanText(heading.replace(/\s*\*?\s*adopted\b.*$/i, ""));
}

function semanticPageText(source: string): string {
  const $ = cheerio.load(source);
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
