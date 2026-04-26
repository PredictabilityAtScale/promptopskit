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

/**
 * OpenAI Responses provider adapter.
 * Produces request bodies compatible with the OpenAI Responses API.
 */
export const openaiResponsesAdapter: ProviderAdapter = withPromptInputSupport({
  name: 'openai-responses',

  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!resolvedAsset.model) {
      errors.push('OpenAI Responses adapter requires a model to be specified.');
    }

    if (resolvedAsset.reasoning?.budget_tokens !== undefined) {
      warnings.push('OpenAI Responses uses reasoning.effort, not budget_tokens. budget_tokens will be ignored.');
    }

    if (resolvedAsset.response?.schema !== undefined && resolvedAsset.response?.format !== 'json') {
      warnings.push('OpenAI Responses response.schema requires response.format: json. schema will still be applied as JSON schema output.');
    }

    if (runtime?.openaiResponses?.conversation !== undefined && runtime?.openaiResponses?.previous_response_id !== undefined) {
      errors.push('OpenAI Responses options "conversation" and "previous_response_id" cannot both be set.');
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const sections = renderSections(resolvedAsset, {
      variables: runtime.variables,
      strict: runtime.strict,
    });
    const responseOptions = runtime.openaiResponses;

    const input: Array<Record<string, unknown>> = [];

    if (runtime.history) {
      for (const msg of runtime.history) {
        input.push({ role: msg.role, content: msg.content });
      }
    }

    if (sections.prompt_template) {
      input.push({ role: 'user', content: sections.prompt_template });
    }

    const body: Record<string, unknown> = {
      model: resolvedAsset.model,
      input,
    };

    if (responseOptions?.instructions !== undefined) {
      body.instructions = responseOptions.instructions;
    } else if (sections.system_instructions) {
      body.instructions = sections.system_instructions;
    }

    // Sampling params
    if (resolvedAsset.sampling?.temperature !== undefined) body.temperature = resolvedAsset.sampling.temperature;
    if (resolvedAsset.sampling?.top_p !== undefined) body.top_p = resolvedAsset.sampling.top_p;
    if (resolvedAsset.sampling?.frequency_penalty !== undefined) body.frequency_penalty = resolvedAsset.sampling.frequency_penalty;
    if (resolvedAsset.sampling?.presence_penalty !== undefined) body.presence_penalty = resolvedAsset.sampling.presence_penalty;
    if (resolvedAsset.sampling?.stop !== undefined) body.stop = resolvedAsset.sampling.stop;
    if (resolvedAsset.sampling?.max_output_tokens !== undefined) body.max_output_tokens = resolvedAsset.sampling.max_output_tokens;

    // Reasoning
    if (resolvedAsset.reasoning?.effort) {
      body.reasoning = { effort: resolvedAsset.reasoning.effort };
    }

    // Structured output / response format
    if (resolvedAsset.response?.schema) {
      body.text = {
        format: {
          type: 'json_schema',
          name: resolvedAsset.response.schema_name ?? `${resolvedAsset.id}_response`,
          ...(resolvedAsset.response.schema_description ? { description: resolvedAsset.response.schema_description } : {}),
          schema: resolvedAsset.response.schema,
          strict: resolvedAsset.response.schema_strict ?? true,
        },
      };
    } else if (resolvedAsset.response?.format === 'json') {
      body.text = { format: { type: 'json_object' } };
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
          return { type: 'function', name: tool };
        }
        return {
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        };
      });
    }

    if (responseOptions?.previous_response_id !== undefined) body.previous_response_id = responseOptions.previous_response_id;
    if (responseOptions?.conversation !== undefined) body.conversation = responseOptions.conversation;
    if (responseOptions?.parallel_tool_calls !== undefined) body.parallel_tool_calls = responseOptions.parallel_tool_calls;
    if (responseOptions?.max_tool_calls !== undefined) body.max_tool_calls = responseOptions.max_tool_calls;
    if (responseOptions?.store !== undefined) body.store = responseOptions.store;
    if (responseOptions?.metadata !== undefined) body.metadata = responseOptions.metadata;
    if (responseOptions?.include !== undefined) body.include = responseOptions.include;
    if (responseOptions?.background !== undefined) body.background = responseOptions.background;

    return {
      body: applyRawProviderBody(body, resolvedAsset, 'openai-responses'),
      provider: 'openai-responses',
      model: resolvedAsset.model ?? 'unknown',
    };
  },
});
