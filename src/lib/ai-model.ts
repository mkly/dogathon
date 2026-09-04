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
