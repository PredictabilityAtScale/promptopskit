import type { ResolvedPromptAsset } from '../schema/index.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ValidationResult,
  RuntimeRenderOptions,
} from './types.js';
import { renderSections } from '../renderer/index.js';
import { resolveAssetForProvider } from './resolve-asset.js';
import { withPromptInputSupport } from './prompt-input.js';

/**
 * OpenAI provider adapter.
 * Produces request bodies compatible with the OpenAI Chat Completions API.
 */
export const openaiAdapter: ProviderAdapter = withPromptInputSupport({
  name: 'openai',

  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!resolvedAsset.model) {
      errors.push('OpenAI adapter requires a model to be specified.');
    }

    if (resolvedAsset.reasoning?.budget_tokens !== undefined) {
      warnings.push('OpenAI uses reasoning_effort, not budget_tokens. budget_tokens will be ignored.');
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const sections = renderSections(resolvedAsset, {
      variables: runtime.variables,
      strict: runtime.strict,
    });

    const messages: Array<Record<string, unknown>> = [];

    // System message
    if (sections.system_instructions) {
      messages.push({ role: 'system', content: sections.system_instructions });
    }

    // History
    if (runtime.history) {
      for (const msg of runtime.history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // User message (prompt template)
    if (sections.prompt_template) {
      messages.push({ role: 'user', content: sections.prompt_template });
    }

    const body: Record<string, unknown> = {
      model: resolvedAsset.model,
      messages,
    };
    const openaiCacheConfig = resolvedAsset.cache?.openai;

    // Sampling params
    if (resolvedAsset.sampling?.temperature !== undefined) body.temperature = resolvedAsset.sampling.temperature;
    if (resolvedAsset.sampling?.top_p !== undefined) body.top_p = resolvedAsset.sampling.top_p;
    if (resolvedAsset.sampling?.frequency_penalty !== undefined) body.frequency_penalty = resolvedAsset.sampling.frequency_penalty;
    if (resolvedAsset.sampling?.presence_penalty !== undefined) body.presence_penalty = resolvedAsset.sampling.presence_penalty;
    if (resolvedAsset.sampling?.stop !== undefined) body.stop = resolvedAsset.sampling.stop;
    if (resolvedAsset.sampling?.max_output_tokens !== undefined) body.max_tokens = resolvedAsset.sampling.max_output_tokens;

    // Reasoning
    if (resolvedAsset.reasoning?.effort) {
      body.reasoning_effort = resolvedAsset.reasoning.effort;
    }

    // Response format
    if (resolvedAsset.response?.format === 'json') {
      body.response_format = { type: 'json_object' };
    }

    // Streaming
    if (resolvedAsset.response?.stream !== undefined) {
      body.stream = resolvedAsset.response.stream;
    }

    if (openaiCacheConfig?.prompt_cache_key) {
      body.prompt_cache_key = openaiCacheConfig.prompt_cache_key;
    }
    if (openaiCacheConfig?.retention) {
      body.prompt_cache_retention = openaiCacheConfig.retention;
    }

    // Tools
    if (resolvedAsset.tools && resolvedAsset.tools.length > 0) {
      body.tools = resolvedAsset.tools.map((tool) => {
        if (typeof tool === 'string') {
          // Look up from registry
          const def = runtime.toolRegistry?.[tool];
          if (def) return def;
          return { type: 'function', function: { name: tool } };
        }
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        };
      });
    }

    return {
      body,
      provider: 'openai',
      model: resolvedAsset.model ?? 'unknown',
    };
  },
});
