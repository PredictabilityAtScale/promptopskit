import type { ResolvedPromptAsset } from '../schema/index.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ValidationResult,
  RuntimeRenderOptions,
} from './types.js';
import { renderSections } from '../renderer/index.js';

/**
 * OpenAI provider adapter.
 * Produces request bodies compatible with the OpenAI Chat Completions API.
 */
export const openaiAdapter: ProviderAdapter = {
  name: 'openai',

  validate(asset: ResolvedPromptAsset): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!asset.model) {
      errors.push('OpenAI adapter requires a model to be specified.');
    }

    if (asset.reasoning?.budget_tokens !== undefined) {
      warnings.push('OpenAI uses reasoning_effort, not budget_tokens. budget_tokens will be ignored.');
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const sections = renderSections(asset, {
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
      model: asset.model,
      messages,
    };

    // Sampling params
    if (asset.sampling?.temperature !== undefined) body.temperature = asset.sampling.temperature;
    if (asset.sampling?.top_p !== undefined) body.top_p = asset.sampling.top_p;
    if (asset.sampling?.frequency_penalty !== undefined) body.frequency_penalty = asset.sampling.frequency_penalty;
    if (asset.sampling?.presence_penalty !== undefined) body.presence_penalty = asset.sampling.presence_penalty;
    if (asset.sampling?.stop !== undefined) body.stop = asset.sampling.stop;
    if (asset.sampling?.max_output_tokens !== undefined) body.max_tokens = asset.sampling.max_output_tokens;

    // Reasoning
    if (asset.reasoning?.effort) {
      body.reasoning_effort = asset.reasoning.effort;
    }

    // Response format
    if (asset.response?.format === 'json') {
      body.response_format = { type: 'json_object' };
    }

    // Streaming
    if (asset.response?.stream !== undefined) {
      body.stream = asset.response.stream;
    }

    // Tools
    if (asset.tools && asset.tools.length > 0) {
      body.tools = asset.tools.map((tool) => {
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
      model: asset.model ?? 'unknown',
    };
  },
};
