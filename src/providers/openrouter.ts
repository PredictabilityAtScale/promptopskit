import { openaiAdapter } from './openai.js';
import type { ResolvedPromptAsset } from '../schema/index.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ValidationResult,
  RuntimeRenderOptions,
} from './types.js';
import { withPromptInputSupport } from './prompt-input.js';
import { applyRawProviderBody } from './raw.js';
import { resolveAssetForProvider } from './resolve-asset.js';

/**
 * OpenRouter provider adapter.
 * Thin preset over the OpenAI adapter — body format is identical,
 * only the provider label differs. The app handles the different
 * base URL and extra headers (HTTP-Referer, X-Title).
 */
export const openrouterAdapter: ProviderAdapter = withPromptInputSupport({
  name: 'openrouter',

  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const validation = openaiAdapter.validate(asset, runtime);
    const hasOpenRouterModels = (resolvedAsset.provider_options?.openrouter?.models?.length ?? 0) > 0;

    if (!hasOpenRouterModels) {
      return validation;
    }

    const modelRequiredError = 'OpenAI adapter requires a model to be specified.';
    const errors = validation.errors.filter((error) => error !== modelRequiredError);
    const warnings = validation.warnings.filter((warning) => warning !== modelRequiredError);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const result = openaiAdapter.render(
      { ...resolvedAsset, raw: undefined },
      {
        variables: runtime.variables,
        history: runtime.history,
        onHistoryCompaction: runtime.onHistoryCompaction,
        toolRegistry: runtime.toolRegistry,
        strict: runtime.strict,
      },
    );
    const openrouterOptions = resolvedAsset.provider_options?.openrouter;
    let body = { ...result.body };

    if (openrouterOptions?.provider !== undefined) body.provider = openrouterOptions.provider;
    if (openrouterOptions?.transforms !== undefined) body.transforms = openrouterOptions.transforms;
    if (openrouterOptions?.plugins !== undefined) body.plugins = openrouterOptions.plugins;
    if (openrouterOptions?.models !== undefined) body.models = openrouterOptions.models;
    if (body.model === undefined) delete body.model;

    body = applyRawProviderBody(body, resolvedAsset, 'openrouter');

    return {
      ...result,
      body,
      provider: 'openrouter',
      model: resolvedAsset.model ?? openrouterOptions?.models?.[0] ?? 'unknown',
    };
  },
});
