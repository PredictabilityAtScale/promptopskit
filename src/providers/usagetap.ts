import { openaiAdapter } from './openai.js';
import type { ResolvedPromptAsset } from '../schema/index.js';
import type { ProviderAdapter, ProviderRequest, RuntimeRenderOptions, ValidationResult } from './types.js';
import { applyRawProviderBody } from './raw.js';
import { resolveAssetForProvider } from './resolve-asset.js';
import { withPromptInputSupport } from './prompt-input.js';

export const USAGETAP_GATEWAY_BASE_URL = 'https://gateway.usagetap.com/v1';
export const USAGETAP_GATEWAY_DEFAULT_MODEL = 'usagetap/standard';
export const USAGETAP_GATEWAY_RESPONSE_HEADER_NAMES = [
  'x-usagetap-call-id',
  'x-llm-model-key',
  'x-request-id',
  'x-usagetap-compression-tokens-saved',
  'x-usagetap-compression-reduction',
] as const;

export interface UsageTapGatewayOpenAIConfig {
  baseURL: string;
  apiKey: string;
}

export interface UsageTapGatewayOpenAIConfigOptions {
  apiKey: string;
  baseURL?: string;
}

export function createUsageTapGatewayOpenAIConfig(
  options: UsageTapGatewayOpenAIConfigOptions,
): UsageTapGatewayOpenAIConfig {
  return { baseURL: options.baseURL ?? USAGETAP_GATEWAY_BASE_URL, apiKey: options.apiKey };
}

function isGPT5Model(model: string): boolean {
  return model.split(/[|,]/).some((candidate) =>
    /^(?:gpt-5|openai[:/]gpt-5)/.test(candidate.trim()),
  );
}

/** OpenAI Chat Completions adapter for the first-party UsageTap gateway. */
export const usagetapAdapter: ProviderAdapter = withPromptInputSupport({
  name: 'usagetap',

  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
    const resolved = resolveAssetForProvider(asset, runtime);
    const validation = openaiAdapter.validate(
      { ...resolved, model: resolved.model ?? USAGETAP_GATEWAY_DEFAULT_MODEL },
      runtime,
    );
    const warnings = validation.warnings.filter(
      (warning) => warning !== 'OpenAI adapter requires a model to be specified.',
    );
    const errors = [...validation.errors];
    if (!runtime?.usagetap?.apiKey) {
      if (runtime === undefined) {
        warnings.push('UsageTap gateway apiKey must be supplied before rendering.');
      } else {
        errors.push('UsageTap gateway adapter requires usagetap.apiKey for Authorization Bearer authentication.');
      }
    }
    return { valid: errors.length === 0, errors, warnings };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const resolved = resolveAssetForProvider(asset, runtime);
    const options = resolved.provider_options?.usagetap;
    const model = resolved.model ?? USAGETAP_GATEWAY_DEFAULT_MODEL;
    const rendered = openaiAdapter.render(
      { ...resolved, model, raw: undefined },
      {
        variables: runtime.variables,
        history: runtime.history,
        onHistoryCompaction: runtime.onHistoryCompaction,
        toolRegistry: runtime.toolRegistry,
        strict: runtime.strict,
      },
    );
    let body = { ...rendered.body };

    if (isGPT5Model(model) && body.max_tokens !== undefined && body.max_completion_tokens === undefined) {
      body.max_completion_tokens = body.max_tokens;
      delete body.max_tokens;
    }
    const fallbacks = resolved.fallback_models?.filter((candidate) => candidate !== model);
    if (fallbacks?.length) body.models = [...new Set(fallbacks)];
    if (options?.customer !== undefined) body.customer = options.customer;
    if (options?.feature !== undefined) body.feature = options.feature;
    if (options?.conversationId !== undefined) body.conversationId = options.conversationId;
    if (options?.conversationTitle !== undefined) body.conversationTitle = options.conversationTitle;
    if (options?.projectId !== undefined) body.projectId = options.projectId;
    if (options?.compress !== undefined) body.compress = options.compress;
    body = applyRawProviderBody(body, resolved, 'usagetap');

    const credentials = runtime.usagetap;
    if (!credentials?.apiKey) {
      throw new Error('UsageTap gateway adapter requires usagetap.apiKey for Authorization Bearer authentication.');
    }
    return {
      provider: 'usagetap',
      model,
      baseURL: options?.base_url ?? USAGETAP_GATEWAY_BASE_URL,
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        ...(credentials.idempotencyKey ? { 'Idempotency-Key': credentials.idempotencyKey } : {}),
      },
      body,
    };
  },
});
