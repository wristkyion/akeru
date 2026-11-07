import { z } from "zod";
import type { GenerationOptions } from "@chars/core";

// Settings the chat can send. Every field is optional. The web app only sends the ones
// the user turned on.
export const GenParams = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().min(0).max(200).optional(),
  minP: z.number().min(0).max(1).optional(),
  repetitionPenalty: z.number().min(0).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().min(0).optional(),
});

export type GenParamsInput = z.infer<typeof GenParams>;

export function toOptions(p: GenParamsInput): GenerationOptions {
  return {
    temperature: p.temperature,
    maxTokens: p.maxTokens,
    topP: p.topP,
    topK: p.topK,
    minP: p.minP,
    repetitionPenalty: p.repetitionPenalty,
    frequencyPenalty: p.frequencyPenalty,
    presencePenalty: p.presencePenalty,
    seed: p.seed,
  };
}
