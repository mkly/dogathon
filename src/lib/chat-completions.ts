export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionOptions = {
  messages: ChatCompletionMessage[];
  maxTokens: number;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

function requiredSetting(value: string | undefined, name: string): string {
  const setting = value?.trim();
  if (!setting) throw new Error(`${name} is required to reach the chat-completions endpoint`);
  return setting;
}

export function hasChatCompletionCredentials(apiKey?: string): boolean {
  return Boolean((apiKey ?? process.env.OPENAI_API_KEY)?.trim());
}

export async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const apiKey = requiredSetting(options.apiKey ?? process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const baseUrl = requiredSetting(options.baseUrl ?? process.env.OPENAI_BASE_URL, "OPENAI_BASE_URL");
  const model = requiredSetting(options.model ?? process.env.OPENAI_MODEL, "OPENAI_MODEL");
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(`${baseUrl.replace(/\/+$/u, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens,
      messages: options.messages,
    }),
  });

  const payload = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Chat completion request failed (${response.status})`);
  }

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Chat completion response contained no text");
  return content;
}
