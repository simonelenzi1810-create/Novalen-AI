import type { ChatRequest, ModelInfo } from '../../shared/contracts.ts';
import type { Env } from '../types.ts';
import { groqProvider } from './groq.ts';
export interface Provider {
  id: string;
  models(env: Env): ModelInfo[];
  complete(input: ChatRequest, env: Env, signal: AbortSignal, transport: typeof fetch): Promise<Response>;
}
// Register adapters only after implementing their API contracts.
// Gemini and OpenAI API are planned, not working integrations.
export const providers: Provider[] = [groqProvider];
export function providerFor(modelId: string, env: Env): Provider | undefined {
  return providers.find(provider => provider.models(env).some(model => model.id === modelId));
}
