import type { ChatMessage, ChatProvider, GenerationOptions, ProviderConfig } from "./types.js";

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export function createOpenAICompatibleProvider(
  cfg: ProviderConfig,
  fetchImpl: typeof fetch = fetch,
): ChatProvider {
  const endpoint = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return {
    id: cfg.id,

    async complete(messages: ChatMessage[], model: string, options: GenerationOptions = {}) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          top_p: options.topP,
          stream: false,
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new ProviderError(`${cfg.id} returned ${res.status}: ${text.slice(0, 300)}`);
      }

      const data = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new ProviderError(`${cfg.id} returned no message content`);
      }
      return content;
    },
  };
}
