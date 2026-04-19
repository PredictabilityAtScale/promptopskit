export type { ProviderAdapter, ProviderRequest, ValidationResult, RuntimeRenderOptions } from './types.js';
export { openaiAdapter } from './openai.js';
export { anthropicAdapter } from './anthropic.js';
export { geminiAdapter } from './gemini.js';
export { openrouterAdapter } from './openrouter.js';

import type { ProviderAdapter } from './types.js';
import { openaiAdapter } from './openai.js';
import { anthropicAdapter } from './anthropic.js';
import { geminiAdapter } from './gemini.js';
import { openrouterAdapter } from './openrouter.js';

const adapters: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  google: geminiAdapter,
  gemini: geminiAdapter,
  openrouter: openrouterAdapter,
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
