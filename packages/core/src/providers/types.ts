export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
}

export interface ProviderConfig {
  id: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
}

export interface ChatProvider {
  id: string;
  complete(
    messages: ChatMessage[],
    model: string,
    options?: GenerationOptions,
    onToken?: (token: string) => void,
  ): Promise<string>;
}
