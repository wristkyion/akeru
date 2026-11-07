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

    async complete(
      messages: ChatMessage[],
      model: string,
      options: GenerationOptions = {},
      onToken?: (token: string) => void,
    ) {
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
          stream: Boolean(onToken),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new ProviderError(`${cfg.id} returned ${res.status}: ${text.slice(0, 300)}`);
      }

      if (!onToken) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
          throw new ProviderError(`${cfg.id} returned no message content`);
        }
        return content;
      }

      return readReply(res, cfg.id, onToken);
    },
  };
}

// Reads a streamed reply piece by piece. Some local servers ignore stream: true and
// answer with plain JSON, so that case is handled too and sent as one piece.
async function readReply(
  res: Response,
  providerId: string,
  onToken: (token: string) => void,
): Promise<string> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream")) {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new ProviderError(`${providerId} returned no message content`);
    }
    onToken(content);
    return content;
  }

  if (!res.body) throw new ProviderError(`${providerId} sent no stream`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");

      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        finished = true;
        break;
      }

      let chunk: { choices?: { delta?: { content?: string } }[] };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue; // ignore a malformed line rather than failing the whole reply
      }
      const piece = chunk.choices?.[0]?.delta?.content;
      if (piece) {
        full += piece;
        onToken(piece);
      }
    }
  }

  if (!full) throw new ProviderError(`${providerId} streamed no text`);
  return full;
}