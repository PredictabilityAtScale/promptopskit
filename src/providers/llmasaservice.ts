import { openaiAdapter } from './openai.js';
import type { ResolvedPromptAsset } from '../schema/index.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  RuntimeRenderOptions,
  ValidationResult,
} from './types.js';
import { applyRawProviderBody } from './raw.js';
import { resolveAssetForProvider } from './resolve-asset.js';
import { withPromptInputSupport } from './prompt-input.js';

export const LLMASASERVICE_BASE_URL = 'https://gateway.llmasaservice.io';
export const LLMASASERVICE_DEFAULT_MODEL = 'group:standard';
export const LLMASASERVICE_RESPONSE_HEADER_NAMES = [
  'x-request-id',
  'x-llm-model-id',
  'x-llm-model-group',
] as const;

export interface LLMAsAServiceOpenAIConfig {
  baseURL: string;
  apiKey: string;
  defaultHeaders?: {
    'x-project-id': string;
  };
}

export interface LLMAsAServiceOpenAIConfigOptions {
  apiKey: string;
  baseURL?: string;
  /** @deprecated Project ids are no longer required by the gateway. */
  projectId?: string;
}

export function createLLMAsAServiceOpenAIConfig(
  options: LLMAsAServiceOpenAIConfigOptions,
): LLMAsAServiceOpenAIConfig {
  return {
    baseURL: options.baseURL ?? LLMASASERVICE_BASE_URL,
    apiKey: options.apiKey,
    ...(options.projectId
      ? { defaultHeaders: { 'x-project-id': options.projectId } }
      : {}),
  };
}

function isGPT5ModelSelector(model: string | undefined): boolean {
  if (!model) return false;
  return model
    .split(/[|,]/)
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate.startsWith('gpt-5') || candidate.startsWith('openai:gpt-5'));
}

function defaultModel(): string {
  return LLMASASERVICE_DEFAULT_MODEL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rawCustomerId(asset: ResolvedPromptAsset): unknown {
  const customer = isRecord(asset.raw?.llmasaservice?.customer)
    ? asset.raw.llmasaservice.customer
    : undefined;
  return customer?.customer_id;
}

/**
 * LLMAsAService gateway adapter.
 * Uses the OpenAI Chat Completions body shape, plus gateway routing and
 * attribution fields supported by gateway.llmasaservice.io.
 */
export const llmasaserviceAdapter: ProviderAdapter = withPromptInputSupport({
  name: 'llmasaservice',

  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const validation = openaiAdapter.validate(
      {
        ...resolvedAsset,
        model: resolvedAsset.model ?? defaultModel(),
      },
      runtime,
    );
    const warnings = validation.warnings.filter(
      (warning) => warning !== 'OpenAI adapter requires a model to be specified.',
    );

    const errors = [...validation.errors];
    const gatewayOptions = resolvedAsset.provider_options?.llmasaservice;
    const missingApiKey = !runtime?.llmasaservice?.apiKey;
    const missingCustomerId =
      !gatewayOptions?.customer?.customer_id && typeof rawCustomerId(resolvedAsset) !== 'string';
    const validateRenderMetadata = runtime !== undefined;

    if (missingApiKey && validateRenderMetadata) {
      errors.push(
        'LLMAsAService adapter requires llmasaservice.apiKey for Authorization Bearer authentication.',
      );
    }

    if (missingCustomerId && validateRenderMetadata) {
      errors.push(
        'LLMAsAService adapter requires customer.customer_id in provider_options.llmasaservice.customer or raw.llmasaservice.customer.',
      );
    }

    if ((missingApiKey || missingCustomerId) && !validateRenderMetadata) {
      warnings.push(
        'LLMAsAService apiKey and customer.customer_id must be supplied before rendering.',
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const options = resolvedAsset.provider_options?.llmasaservice;
    const model = resolvedAsset.model ?? defaultModel();
    const result = openaiAdapter.render(
      { ...resolvedAsset, model, raw: undefined },
      {
        variables: runtime.variables,
        history: runtime.history,
        onHistoryCompaction: runtime.onHistoryCompaction,
        toolRegistry: runtime.toolRegistry,
        strict: runtime.strict,
      },
    );
    let body = { ...result.body };

    if (isGPT5ModelSelector(model) && body.max_tokens !== undefined && body.max_completion_tokens === undefined) {
      body.max_completion_tokens = body.max_tokens;
      delete body.max_tokens;
    }

    if (options?.customer !== undefined) body.customer = options.customer;
    if (options?.conversationId !== undefined) body.conversationId = options.conversationId;
    if (options?.conversationTitle !== undefined) body.conversationTitle = options.conversationTitle;
    if (options?.projectId !== undefined) body.projectId = options.projectId;

    body = applyRawProviderBody(body, resolvedAsset, 'llmasaservice');

    const apiKey = runtime.llmasaservice?.apiKey;
    if (!apiKey) {
      throw new Error(
        'LLMAsAService adapter requires llmasaservice.apiKey for Authorization Bearer authentication.',
      );
    }
    const projectId = options?.project_id;

    return {
      body,
      provider: 'llmasaservice',
      model,
      baseURL: options?.base_url ?? LLMASASERVICE_BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(projectId ? { 'x-project-id': projectId } : {}),
      },
    };
  },
});
