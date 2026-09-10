import { generateText, Output } from "ai";
import { z } from "zod";

import { createAiModel, hasAiCredentials, reasoning } from "./ai-model.ts";
import { env } from "./env.ts";
import { formatDate } from "./format.ts";

export type SponsorUpdateType = "regular" | "graduation";

export interface SponsorUpdateCompanion {
  name: string;
  available: boolean;
  breed?: string;
  sex?: string;
  ageText?: string;
  personality?: string;
}

export interface SponsorUpdatePhoto {
  id: string;
  url: string;
  takenAt: Date;
}

export interface SponsorUpdateChat {
  completedAt: Date;
  transcript: string[];
  photos: SponsorUpdatePhoto[];
}

export interface ComposeSponsorUpdateInput {
  signal?: AbortSignal;
  companion: SponsorUpdateCompanion;
  chats: SponsorUpdateChat[];
  previousUpdate?: {
    sentAt: Date;
    bodyText: string;
  };
  pinnedPostscript: string;
  type: SponsorUpdateType;
  companionPageUrl: string;
}

export interface ComposedSponsorUpdate {
  subject: string;
  teaser: string;
  bodyText: string;
  heroPhotoId: string | null;
  captions: Array<{
    photoId: string;
    caption: string;
  }>;
}

type ComposerMessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: URL | Uint8Array; mediaType: "image/jpeg" };

export interface ComposerUserMessage {
  role: "user";
  content: ComposerMessagePart[];
}

const MAX_PHOTOS = 40;
const MAX_CHATS = 25;

const composedSponsorUpdateSchema = z.object({
  subject: z.string().max(60),
  teaser: z.string().max(240),
  bodyText: z.string(),
  captions: z.array(
    z.object({
      photoId: z.string(),
      caption: z.string().max(90),
    }),
  ),
});

type ModelDraft = z.infer<typeof composedSponsorUpdateSchema>;

function newestChats(chats: SponsorUpdateChat[]) {
  if (chats.length > MAX_CHATS) {
    console.warn(
      `Composer received ${chats.length} chats; using the newest ${MAX_CHATS}.`,
    );
  }
  return chats
    .toSorted(
      (left, right) => left.completedAt.getTime() - right.completedAt.getTime(),
    )
    .slice(-MAX_CHATS);
}

function newestPhotos(chats: SponsorUpdateChat[]) {
  const photos = chats
    .flatMap((chat) => chat.photos)
    .toSorted(
      (left, right) => right.takenAt.getTime() - left.takenAt.getTime(),
    );
  if (photos.length > MAX_PHOTOS) {
    console.warn(
      `Composer received ${photos.length} photos; using the newest ${MAX_PHOTOS}.`,
    );
  }
  return photos.slice(0, MAX_PHOTOS);
}

function selectedInput(input: ComposeSponsorUpdateInput) {
  const chats = newestChats(input.chats);
  return { chats, photos: newestPhotos(input.chats) };
}

function words(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function volunteerObservations(chat: SponsorUpdateChat) {
  const volunteerLines = chat.transcript
    .filter((line) => /^Volunteer:\s*/u.test(line))
    .map((line) => line.replace(/^Volunteer:\s*/u, "").trim())
    .filter(Boolean);

  // Direct callers and older fixtures may not label speakers. In that case,
  // keep their source material rather than producing an empty update.
  if (volunteerLines.length > 0) return volunteerLines;
  return chat.transcript
    .filter((line) => !/^Interviewer:\s*/u.test(line))
    .map((line) => line.trim())
    .filter(Boolean);
}

function compositionLengthBrief(
  input: ComposeSponsorUpdateInput,
  chats: SponsorUpdateChat[],
) {
  const visitCount = chats.length;
  const uniqueObservations = new Map<string, string>();
  for (const observation of chats.flatMap(volunteerObservations)) {
    const normalized = observation.toLowerCase().replace(/\s+/gu, " ");
    if (!uniqueObservations.has(normalized)) {
      uniqueObservations.set(normalized, observation);
    }
  }
  const observationWordCount = [...uniqueObservations.values()].reduce(
    (total, observation) => total + words(observation),
    0,
  );
  const sourceSummary = `${visitCount} visit${visitCount === 1 ? "" : "s"} and ${observationWordCount} words of volunteer observations`;

  if (input.type === "graduation") {
    return [
      `Writing brief: the adoption story has ${sourceSummary}, plus the supplied graduation seed.`,
      "Keep the narrative proportional to those facts; generally target 100 to 220 words and do not exceed 280 words. Use less when the seed and observations are sparse.",
      "The required postscript is appended separately and does not count toward this narrative range.",
    ].join("\n");
  }

  const sparse = visitCount <= 1 || observationWordCount < 80;
  return [
    `Writing brief: this regular update has ${sourceSummary} and is ${sparse ? "sparse" : "rich"}.`,
    sparse
      ? "Write one or two short paragraphs, generally 40 to 100 words, with a hard maximum of 120 words. Use fewer than 40 words when that is all the facts support. Do not use headings."
      : "Write concise paragraphs, generally 100 to 220 words, with a hard maximum of 250 words. Every added paragraph must be supported by distinct volunteer observations.",
    "Judge length only from visit count and substantive volunteer observations. Interviewer wording, photo count, and profile length never justify a longer update.",
    "The required postscript is appended separately and does not count toward this narrative range.",
  ].join("\n");
}

function canSendPhotoUrlDirectly(url: string) {
  return env.features.s3 && /^https?:\/\//u.test(url);
}

async function imagePart(
  photo: SponsorUpdatePhoto,
  companionPageUrl: string,
  signal?: AbortSignal,
): Promise<ComposerMessagePart> {
  if (canSendPhotoUrlDirectly(photo.url)) {
    return {
      type: "image",
      image: new URL(photo.url),
      mediaType: "image/jpeg",
    };
  }

  const response = await fetch(new URL(photo.url, companionPageUrl), {
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Could not load composer photo ${photo.id}: HTTP ${response.status}`,
    );
  }
  return {
    type: "image",
    image: new Uint8Array(await response.arrayBuffer()),
    mediaType: "image/jpeg",
  };
}

function companionProfile(input: ComposeSponsorUpdateInput) {
  return [
    `Companion profile for ${input.companion.name}:`,
    `Breed: ${input.companion.breed ?? "Not provided"}`,
    `Sex: ${input.companion.sex ?? "Not provided"}`,
    `Age: ${input.companion.ageText ?? "Not provided"}`,
    `Personality: ${input.companion.personality ?? "Not provided"}`,
    `Available for adoption: ${input.companion.available ? "yes" : "no"}`,
    `Companion page: ${input.companionPageUrl}`,
    `Update type: ${input.type}`,
  ].join("\n");
}

/** Build the single multimodal user message consumed by the update composer. */
export async function buildComposerMessages(
  input: ComposeSponsorUpdateInput,
): Promise<ComposerUserMessage> {
  const { chats, photos } = selectedInput(input);
  const content: ComposerMessagePart[] = [];

  for (const [index, photo] of photos.entries()) {
    content.push({
      type: "text",
      text: `Photo ${index + 1} (id ${photo.id}, from the visit on ${formatDate(photo.takenAt)})`,
    });
    content.push(await imagePart(photo, input.companionPageUrl, input.signal));
  }

  for (const chat of chats) {
    content.push({
      type: "text",
      text: [
        `Chat from the visit on ${formatDate(chat.completedAt)}:`,
        ...chat.transcript,
      ].join("\n"),
    });
  }

  content.push({ type: "text", text: companionProfile(input) });
  if (input.previousUpdate) {
    content.push({
      type: "text",
      text: [
        input.type === "graduation"
          ? "The current graduation draft is the seed for this adoption story:"
          : `The last update sent on ${formatDate(input.previousUpdate.sentAt)} said:`,
        input.previousUpdate.bodyText,
      ].join("\n\n"),
    });
  }
  content.push({
    type: "text",
    text: compositionLengthBrief(input, chats),
  });

  return { role: "user", content };
}

function appendPostscript(bodyText: string, postscript: string): string {
  if (!postscript) return bodyText.trim();
  const trimmedBody = bodyText.trim();
  return trimmedBody ? `${trimmedBody}\n\n${postscript}` : postscript;
}

function deterministicCompose(
  input: ComposeSponsorUpdateInput,
): ComposedSponsorUpdate {
  const name = input.companion.name.trim();
  const { chats, photos } = selectedInput(input);
  const visitCount = chats.length;
  const chatBody = chats
    .map((chat) => volunteerObservations(chat).join(" "))
    .filter(Boolean)
    .join("\n\n");
  const body =
    input.type === "graduation"
      ? [input.previousUpdate?.bodyText.trim(), chatBody]
          .filter(Boolean)
          .join("\n\n")
      : chatBody;

  return {
    subject:
      input.type === "graduation"
        ? `${name} found a home!`
        : `${name}: news from ${visitCount} recent visits`,
    teaser:
      input.type === "graduation"
        ? `${name} has found a home. Here is a warm look back at the moments that brought them here.`
        : `${name} has news from ${visitCount} recent visits. Read about the moments volunteers shared with ${name}.`,
    bodyText: appendPostscript(body, input.pinnedPostscript),
    heroPhotoId: photos[0]?.id ?? null,
    captions: photos.map((photo) => ({
      photoId: photo.id,
      caption: `Photo from a visit on ${formatDate(photo.takenAt)}`,
    })),
  };
}

function finalizeDraft(
  draft: ModelDraft,
  input: ComposeSponsorUpdateInput,
): ComposedSponsorUpdate {
  const { photos } = selectedInput(input);
  return {
    subject: draft.subject.trim(),
    teaser: draft.teaser.trim(),
    bodyText: appendPostscript(draft.bodyText, input.pinnedPostscript),
    heroPhotoId: photos[0]?.id ?? null,
    captions: draft.captions,
  };
}

// The configured reasoning model spends this budget on hidden thought as well
// as the structured draft. Smaller budgets can end before any JSON is emitted
// for a multimodal update, even though the finished story is short.
const MAX_SPONSOR_UPDATE_OUTPUT_TOKENS = 32000;

const SPONSOR_UPDATE_SYSTEM_PROMPT = `You write updates for an animal rescue in the rescue's first-person-plural voice ("we" and "our"). The reader sponsors this companion, cares about them, and will probably read on a phone. Write with the specificity and warmth of people who know the animal, not with marketing copy or a technology-brochure voice.

Use only the supplied companion profile, volunteer chats, photos, and previous update. Never invent an event or detail. Do not make medical or behavioral claims beyond what a volunteer actually said. Never say or imply that the reader is the only sponsor or that their sponsorship funds this specific animal. Do not use the terms "care team", "check-in", or "furbaby".

Return:
- A subject of at most 60 characters. Name the companion and something that actually happened; never use "An update on <name>" or another generic update announcement.
- A teaser of one or two complete sentences that works as the opening of an email and makes the specific news clear. Keep it comfortably under 240 characters; never cut off a thought to fill the limit. Make the subject, teaser, body, and captions complementary; do not repeat the same sentence across fields.
- A concise Markdown body whose length follows the writing brief in the user message. There is no minimum to pad toward. Tell only the supported events in narrative order. Quote or closely paraphrase concrete volunteer observations when they add character. Refer naturally to supplied photos when relevant, but do not add prose merely because photos exist. Use headings only for a genuinely rich multi-visit story, with no more than two short headings and never a date as a heading. Do not insert photo ids or standalone caption lines in the body; captions are returned separately.
- Exactly one caption for every supplied photo, using that photo's exact id in the photoId field. Each caption must be at most 90 characters and describe what is visible, informed by the chats without claiming anything the image and chats do not support. Do not repeat the photo id in the caption text.

Avoid repeated facts, flowery filler, generic gratitude paragraphs, invented emotional significance, and overstated medical or behavioral claims. Prefer warm, plain, specific rescue language. Treat interviewer questions as context, not source observations, and never make the story longer because an interviewer was verbose. The pinned postscript is appended by the application, so do not recreate it in the narrative.

For a regular update, focus on what happened during the recent visits. Use the profile only for helpful context, and do not repeat the previous update.

For a graduation update, tell the companion's adoption story. Open with the adoption news, continue through the recent visits in narrative order, and end warmly without asking for money.`;

async function composeWithModel(
  input: ComposeSponsorUpdateInput,
): Promise<ComposedSponsorUpdate> {
  const { output } = await generateText({
    abortSignal: input.signal,
    model: createAiModel(),
    maxOutputTokens: MAX_SPONSOR_UPDATE_OUTPUT_TOKENS,
    providerOptions: reasoning("medium"),
    output: Output.object({ schema: composedSponsorUpdateSchema }),
    instructions: SPONSOR_UPDATE_SYSTEM_PROMPT,
    messages: [await buildComposerMessages(input)],
  });

  return finalizeDraft(output, input);
}

/**
 * Draft a sponsor update. With no API key, this uses a deterministic template
 * so local demos and tests never require network access.
 */
export async function composeSponsorUpdate(
  input: ComposeSponsorUpdateInput,
): Promise<ComposedSponsorUpdate> {
  const name = input.companion.name.trim();
  if (!name) throw new Error("companion.name is required");
  if (input.type !== "regular" && input.type !== "graduation") {
    throw new Error("type must be regular or graduation");
  }
  if (input.type === "regular" && !input.companion.available) {
    throw new Error("regular updates require an available companion");
  }

  return hasAiCredentials()
    ? composeWithModel(input)
    : deterministicCompose(input);
}
