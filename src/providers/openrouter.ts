import { openaiAdapter } from './openai.js';
import type { ResolvedPromptAsset } from '../schema/index.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ValidationResult,
  RuntimeRenderOptions,
} from './types.js';

/**
 * OpenRouter provider adapter.
 * Thin preset over the OpenAI adapter — body format is identical,
 * only the provider label differs. The app handles the different
 * base URL and extra headers (HTTP-Referer, X-Title).
 */
export const openrouterAdapter: ProviderAdapter = {
  name: 'openrouter',

  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
    return openaiAdapter.validate(asset, runtime);
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const result = openaiAdapter.render(asset, runtime);
    return {
      ...result,
      provider: 'openrouter',
    };
  },
};
