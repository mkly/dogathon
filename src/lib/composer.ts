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
  captions: z.array(z.object({
    photoId: z.string(),
    caption: z.string().max(90),
  })),
});

type ModelDraft = z.infer<typeof composedSponsorUpdateSchema>;

function newestChats(chats: SponsorUpdateChat[]) {
  if (chats.length > MAX_CHATS) {
    console.warn(`Composer received ${chats.length} chats; using the newest ${MAX_CHATS}.`);
  }
  return chats
    .toSorted((left, right) => left.completedAt.getTime() - right.completedAt.getTime())
    .slice(-MAX_CHATS);
}

function newestPhotos(chats: SponsorUpdateChat[]) {
  const photos = chats
    .flatMap((chat) => chat.photos)
    .toSorted((left, right) => right.takenAt.getTime() - left.takenAt.getTime());
  if (photos.length > MAX_PHOTOS) {
    console.warn(`Composer received ${photos.length} photos; using the newest ${MAX_PHOTOS}.`);
  }
  return photos.slice(0, MAX_PHOTOS);
}

function selectedInput(input: ComposeSponsorUpdateInput) {
  const chats = newestChats(input.chats);
  return { chats, photos: newestPhotos(input.chats) };
}

function canSendPhotoUrlDirectly(url: string) {
  return env.features.s3 && /^https?:\/\//u.test(url);
}

async function imagePart(photo: SponsorUpdatePhoto, companionPageUrl: string): Promise<ComposerMessagePart> {
  if (canSendPhotoUrlDirectly(photo.url)) {
    return { type: "image", image: new URL(photo.url), mediaType: "image/jpeg" };
  }

  const response = await fetch(new URL(photo.url, companionPageUrl));
  if (!response.ok) {
    throw new Error(`Could not load composer photo ${photo.id}: HTTP ${response.status}`);
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
export async function buildComposerMessages(input: ComposeSponsorUpdateInput): Promise<ComposerUserMessage> {
  const { chats, photos } = selectedInput(input);
  const content: ComposerMessagePart[] = [];

  for (const [index, photo] of photos.entries()) {
    content.push({
      type: "text",
      text: `Photo ${index + 1} (id ${photo.id}, from the visit on ${formatDate(photo.takenAt)})`,
    });
    content.push(await imagePart(photo, input.companionPageUrl));
  }

  for (const chat of chats) {
    content.push({
      type: "text",
      text: [`Chat from the visit on ${formatDate(chat.completedAt)}:`, ...chat.transcript].join("\n"),
    });
  }

  content.push({ type: "text", text: companionProfile(input) });
  if (input.previousUpdate) {
    content.push({
      type: "text",
      text: [
        `The last update sent on ${formatDate(input.previousUpdate.sentAt)} said:`,
        input.previousUpdate.bodyText,
      ].join("\n\n"),
    });
  }

  return { role: "user", content };
}

function appendPostscript(bodyText: string, postscript: string): string {
  if (!postscript) return bodyText.trim();
  const trimmedBody = bodyText.trim();
  return trimmedBody ? `${trimmedBody}\n\n${postscript}` : postscript;
}

function deterministicCompose(input: ComposeSponsorUpdateInput): ComposedSponsorUpdate {
  const name = input.companion.name.trim();
  const { chats, photos } = selectedInput(input);
  const visitCount = chats.length;
  const body = chats.map((chat) => [
    `On ${formatDate(chat.completedAt)}:`,
    chat.transcript.join("\n"),
  ].join("\n\n")).join("\n\n");

  return {
    subject: `${name}: news from ${visitCount} recent visits`,
    teaser: `${name} has news from ${visitCount} recent visits. Read about the moments volunteers shared with ${name}.`,
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

const MAX_SPONSOR_UPDATE_OUTPUT_TOKENS = 8000;

async function composeWithModel(input: ComposeSponsorUpdateInput): Promise<ComposedSponsorUpdate> {
  const { output } = await generateText({
    model: createAiModel(),
    maxOutputTokens: MAX_SPONSOR_UPDATE_OUTPUT_TOKENS,
    providerOptions: reasoning("medium"),
    output: Output.object({ schema: composedSponsorUpdateSchema }),
    instructions:
      "Write a warm animal-rescue update grounded only in the supplied companion profile, volunteer chats, and photos. Return a concise subject and teaser, a readable Markdown story, and one factual caption for every photo.",
    messages: [await buildComposerMessages(input)],
  });

  return finalizeDraft(output, input);
}

/**
 * Draft a sponsor update. With no API key, this uses a deterministic template
 * so local demos and tests never require network access.
 */
export async function composeSponsorUpdate(input: ComposeSponsorUpdateInput): Promise<ComposedSponsorUpdate> {
  const name = input.companion.name.trim();
  if (!name) throw new Error("companion.name is required");
  if (input.type !== "regular" && input.type !== "graduation") {
    throw new Error("type must be regular or graduation");
  }
  if (input.type === "regular" && !input.companion.available) {
    throw new Error("regular updates require an available companion");
  }

  return hasAiCredentials() ? composeWithModel(input) : deterministicCompose(input);
}
