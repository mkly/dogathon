import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

export type ChatCompletionMessage = ChatCompletionMessageParam;
export type ChatCompletionTool = ChatCompletionFunctionTool;
export type ChatCompletionAssistantMessage = ChatCompletionAssistantMessageParam;

export type ChatCompletionOptions = {
  messages: ChatCompletionMessage[];
  maxTokens: number;
  tools?: ChatCompletionTool[];
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

function requiredSetting(value: string | undefined, name: string): string {
  const setting = value?.trim();
  if (!setting) throw new Error(`${name} is required to reach the chat-completions endpoint`);
  return setting;
}

export function hasChatCompletionCredentials(apiKey?: string): boolean {
  return Boolean((apiKey ?? process.env.OPENAI_API_KEY)?.trim());
}

async function requestChatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionAssistantMessage> {
  const apiKey = requiredSetting(options.apiKey ?? process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const baseURL = requiredSetting(options.baseUrl ?? process.env.OPENAI_BASE_URL, "OPENAI_BASE_URL");
  const model = requiredSetting(options.model ?? process.env.OPENAI_MODEL, "OPENAI_MODEL");
  const client = new OpenAI({
    apiKey,
    baseURL,
    fetch: options.fetch,
    // Make the SDK's default retry policy explicit because roster discovery used to fail fast.
    maxRetries: 2,
  });
  const completion = await client.chat.completions.create({
    model,
    max_tokens: options.maxTokens,
    messages: options.messages,
    ...(options.tools ? { tools: options.tools, tool_choice: "auto" as const } : {}),
  }, { signal: options.signal });

  const message = completion.choices[0]?.message;
  if (!message) throw new Error("Chat completion response contained no message");
  const content = message.content?.trim() || null;
  if (!content && !message.tool_calls?.length) {
    throw new Error("Chat completion response contained no text or tool calls");
  }
  return {
    role: "assistant",
    content,
    refusal: message.refusal,
    tool_calls: message.tool_calls,
  };
}

export async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const message = await requestChatCompletion(options);
  if (typeof message.content !== "string" || !message.content) {
    throw new Error("Chat completion response contained no text");
  }
  return message.content;
}

export function createToolCallingChatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionAssistantMessage> {
  return requestChatCompletion(options);
}
