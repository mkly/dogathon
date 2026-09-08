import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { env } from "./env.ts";

export type AiModelOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
};

export function hasAiCredentials(apiKey?: string): boolean {
  return apiKey === undefined ? env.features.ai : Boolean(apiKey.trim());
}

export type ReasoningEffort = "low" | "medium" | "high";

/**
 * Per-call provider options that set the model's reasoning budget. "none" is
 * deliberately absent: GLM through Nebius then leaks its thinking into the
 * visible reply. Keyed by the provider name given to createAiModel.
 */
export function reasoning(effort: ReasoningEffort) {
  return { dogathon: { reasoningEffort: effort } };
}

export function createAiModel(options: AiModelOptions = {}) {
  const apiKey = options.apiKey ?? env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set; the model cannot be reached");

  const baseURL = options.baseUrl ?? env.OPENAI_BASE_URL;
  const model = options.model ?? env.OPENAI_MODEL;

  return createOpenAICompatible({
    name: "dogathon",
    apiKey,
    baseURL,
    fetch: options.fetch,
    supportsStructuredOutputs: true,
  }).chatModel(model);
}
