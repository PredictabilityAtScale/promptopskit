export type {
  ProviderAdapter,
  ProviderInlinePromptSource,
  ProviderPromptInput,
  ProviderPromptLookup,
  ProviderRequest,
  ValidationResult,
  RuntimeRenderOptions,
  LLMAsAServiceRuntimeOptions,
} from './types.js';
export { openaiAdapter } from './openai.js';
export { openaiResponsesAdapter } from './openai-responses.js';
export { anthropicAdapter } from './anthropic.js';
export { geminiAdapter } from './gemini.js';
export { openrouterAdapter } from './openrouter.js';
export {
  LLMASASERVICE_BASE_URL,
  LLMASASERVICE_DEFAULT_MODEL,
  LLMASASERVICE_RESPONSE_HEADER_NAMES,
  createLLMAsAServiceOpenAIConfig,
  llmasaserviceAdapter,
} from './llmasaservice.js';

import type { ProviderAdapter } from './types.js';
import { openaiAdapter } from './openai.js';
import { openaiResponsesAdapter } from './openai-responses.js';
import { anthropicAdapter } from './anthropic.js';
import { geminiAdapter } from './gemini.js';
import { openrouterAdapter } from './openrouter.js';
import { llmasaserviceAdapter } from './llmasaservice.js';

const adapters: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  'openai-responses': openaiResponsesAdapter,
  anthropic: anthropicAdapter,
  google: geminiAdapter,
  gemini: geminiAdapter,
  openrouter: openrouterAdapter,
  llmasaservice: llmasaserviceAdapter,
};

/**
 * Get a provider adapter by name.
 */
export function getAdapter(provider: string): ProviderAdapter {
  const adapter = adapters[provider];
  if (!adapter) {
    throw new Error(
      `Unknown provider: "${provider}". Supported: ${Object.keys(adapters).join(', ')}`,
    );
  }
  return adapter;
}
