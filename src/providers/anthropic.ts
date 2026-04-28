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
import { applyRawProviderBody } from './raw.js';
import { compactHistoryForPrompt } from '../history.js';

/**
 * Anthropic provider adapter.
 * Produces request bodies compatible with the Anthropic Messages API.
 */
export const anthropicAdapter: ProviderAdapter = withPromptInputSupport({
  name: 'anthropic',

  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!resolvedAsset.model) {
      errors.push('Anthropic adapter requires a model to be specified.');
    }

    if (resolvedAsset.sampling?.frequency_penalty !== undefined) {
      warnings.push('Anthropic does not support frequency_penalty. It will be ignored.');
    }
    if (resolvedAsset.sampling?.presence_penalty !== undefined) {
      warnings.push('Anthropic does not support presence_penalty. It will be ignored.');
    }
    if (resolvedAsset.reasoning?.effort !== undefined) {
      warnings.push('Anthropic uses budget_tokens for thinking, not effort. effort will be mapped approximately.');
    }
    if (resolvedAsset.response?.schema !== undefined && resolvedAsset.response?.format !== 'json') {
      warnings.push('Anthropic response.schema is mapped to output_config.format and should usually be paired with response.format: json.');
    }

    if (resolvedAsset.provider_options?.anthropic?.top_k !== undefined && resolvedAsset.provider_options.anthropic.top_k < 0) {
      errors.push('Anthropic provider_options.top_k must be >= 0.');
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
    const anthropicCacheConfig = resolvedAsset.cache?.anthropic;
    const cacheType = anthropicCacheConfig?.type ?? 'ephemeral';
    const cacheControl = anthropicCacheConfig
      ? {
        type: cacheType,
        ...(anthropicCacheConfig.ttl ? { ttl: anthropicCacheConfig.ttl } : {}),
      }
      : undefined;
    const cacheMode = anthropicCacheConfig?.mode ?? 'automatic';

    // History
    const history = compactHistoryForPrompt(resolvedAsset, runtime);
    if (history) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // User message (prompt template)
    if (sections.prompt_template) {
      if (cacheControl && cacheMode === 'explicit' && anthropicCacheConfig?.cache_prompt_template) {
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: sections.prompt_template, cache_control: cacheControl }],
        });
      } else {
        messages.push({ role: 'user', content: sections.prompt_template });
      }
    }

    const body: Record<string, unknown> = {
      model: resolvedAsset.model,
      messages,
    };

    // System goes as top-level field in Anthropic
    if (sections.system_instructions) {
      if (cacheControl && cacheMode === 'explicit' && anthropicCacheConfig?.cache_system_instructions !== false) {
        body.system = [{ type: 'text', text: sections.system_instructions, cache_control: cacheControl }];
      } else {
        body.system = sections.system_instructions;
      }
    }

    // Sampling params
    if (resolvedAsset.sampling?.temperature !== undefined) body.temperature = resolvedAsset.sampling.temperature;
    if (resolvedAsset.sampling?.top_p !== undefined) body.top_p = resolvedAsset.sampling.top_p;
    if (resolvedAsset.sampling?.stop !== undefined) body.stop_sequences = resolvedAsset.sampling.stop;
    if (resolvedAsset.sampling?.max_output_tokens !== undefined) {
      body.max_tokens = resolvedAsset.sampling.max_output_tokens;
    } else {
      // Anthropic requires max_tokens
      body.max_tokens = 4096;
    }

    // Thinking/reasoning
    if (resolvedAsset.reasoning?.budget_tokens) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: resolvedAsset.reasoning.budget_tokens,
      };
    }

    // Provider-specific options
    if (resolvedAsset.provider_options?.anthropic?.top_k !== undefined) {
      body.top_k = resolvedAsset.provider_options.anthropic.top_k;
    }

    if (resolvedAsset.provider_options?.anthropic?.output_config !== undefined) {
      body.output_config = resolvedAsset.provider_options.anthropic.output_config;
    } else if (resolvedAsset.response?.schema !== undefined) {
      body.output_config = {
        format: {
          type: 'json_schema',
          schema: resolvedAsset.response.schema,
        },
      };
    }

    // Streaming
    if (resolvedAsset.response?.stream !== undefined) {
      body.stream = resolvedAsset.response.stream;
    }

    if (cacheControl && cacheMode === 'automatic') {
      body.cache_control = cacheControl;
    }

    // Tools
    if (resolvedAsset.tools && resolvedAsset.tools.length > 0) {
      body.tools = resolvedAsset.tools.map((tool) => {
        if (typeof tool === 'string') {
          const def = runtime.toolRegistry?.[tool];
          if (def) {
            if (cacheControl && cacheMode === 'explicit' && anthropicCacheConfig?.cache_tools) {
              return { ...(def as Record<string, unknown>), cache_control: cacheControl };
            }
            return def;
          }
          return {
            name: tool,
            ...(cacheControl && cacheMode === 'explicit' && anthropicCacheConfig?.cache_tools
              ? { cache_control: cacheControl }
              : {}),
          };
        }
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema ?? { type: 'object', properties: {} },
          ...(cacheControl && cacheMode === 'explicit' && anthropicCacheConfig?.cache_tools
            ? { cache_control: cacheControl }
            : {}),
        };
      });
    }

    if (resolvedAsset.provider_options?.anthropic?.tool_choice !== undefined) {
      body.tool_choice = resolvedAsset.provider_options.anthropic.tool_choice;
    }

    return {
      body: applyRawProviderBody(body, resolvedAsset, 'anthropic'),
      provider: 'anthropic',
      model: resolvedAsset.model ?? 'unknown',
    };
  },
});
