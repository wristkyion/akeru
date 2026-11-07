import { createOpenAICompatibleProvider, ProviderError } from "./openai-compatible.js";
import type { ChatMessage, ChatProvider, GenerationOptions, ProviderConfig } from "./types.js";

export function createProviderRegistry(configs: ProviderConfig[]) {
  const providers = new Map<string, ChatProvider>(
    configs.map((c) => [c.id, createOpenAICompatibleProvider(c)]),
  );

  return {
    list: () => configs.map((c) => ({ id: c.id, models: c.models })),
    get(id: string): ChatProvider {
      const p = providers.get(id);
      if (!p) throw new ProviderError(`unknown provider: ${id}`);
      return p;
    },
  };
}

export function parseModelRef(ref: string): { providerId: string; modelId: string } {
  const i = ref.indexOf("/");
  if (i <= 0 || i === ref.length - 1) {
    throw new ProviderError(`model must look like "provider/model", got: ${ref}`);
  }
  return { providerId: ref.slice(0, i), modelId: ref.slice(i + 1) };
}

export function completeWithRef(
  registry: ReturnType<typeof createProviderRegistry>,
  ref: string,
  messages: ChatMessage[],
  options?: GenerationOptions,
  onToken?: (token: string) => void,
): Promise<string> {
  const { providerId, modelId } = parseModelRef(ref);
  return registry.get(providerId).complete(messages, modelId, options, onToken);
}