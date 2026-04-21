import type { ResolvedPromptAsset } from '../schema/index.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ValidationResult,
  RuntimeRenderOptions,
} from './types.js';
import { renderSections } from '../renderer/index.js';
import { resolveAssetForProvider } from './resolve-asset.js';

/**
 * Anthropic provider adapter.
 * Produces request bodies compatible with the Anthropic Messages API.
 */
export const anthropicAdapter: ProviderAdapter = {
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

    return { valid: errors.length === 0, errors, warnings };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const sections = renderSections(resolvedAsset, {
      variables: runtime.variables,
      strict: runtime.strict,
    });

    const messages: Array<Record<string, unknown>> = [];

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

    // System goes as top-level field in Anthropic
    if (sections.system_instructions) {
      body.system = sections.system_instructions;
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

    // Streaming
    if (resolvedAsset.response?.stream !== undefined) {
      body.stream = resolvedAsset.response.stream;
    }

    // Tools
    if (resolvedAsset.tools && resolvedAsset.tools.length > 0) {
      body.tools = resolvedAsset.tools.map((tool) => {
        if (typeof tool === 'string') {
          const def = runtime.toolRegistry?.[tool];
          if (def) return def;
          return { name: tool };
        }
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema ?? { type: 'object', properties: {} },
        };
      });
    }

    return {
      body,
      provider: 'anthropic',
      model: resolvedAsset.model ?? 'unknown',
    };
  },
};
