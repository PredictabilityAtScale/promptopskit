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
 * Google Gemini provider adapter.
 * Produces request bodies compatible with the Gemini generateContent API.
 */
export const geminiAdapter: ProviderAdapter = withPromptInputSupport({
  name: 'gemini',

  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const errors: string[] = [];
    const warnings: string[] = [];
    const geminiCache = resolvedAsset.cache?.gemini?.cached_content;
    const googleCache = resolvedAsset.cache?.google?.cached_content;

    if (!resolvedAsset.model) {
      errors.push('Gemini adapter requires a model to be specified.');
    }

    if (resolvedAsset.sampling?.frequency_penalty !== undefined) {
      warnings.push('Gemini does not support frequency_penalty. It will be ignored.');
    }
    if (resolvedAsset.sampling?.presence_penalty !== undefined) {
      warnings.push('Gemini does not support presence_penalty. It will be ignored.');
    }
    if (geminiCache && googleCache && geminiCache !== googleCache) {
      warnings.push('Both cache.gemini.cached_content and cache.google.cached_content are set. Gemini uses cache.gemini.cached_content.');
    }
    if (resolvedAsset.response?.stream !== undefined) {
      warnings.push('Gemini streaming is endpoint-based (streamGenerateContent), not body-based. response.stream will be ignored.');
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const resolvedAsset = resolveAssetForProvider(asset, runtime);
    const sections = renderSections(resolvedAsset, {
      variables: runtime.variables,
      strict: runtime.strict,
    });

    const contents: Array<Record<string, unknown>> = [];

    // History
    if (runtime.history) {
      for (const msg of runtime.history) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    // User message (prompt template)
    if (sections.prompt_template) {
      contents.push({
        role: 'user',
        parts: [{ text: sections.prompt_template }],
      });
    }

    const body: Record<string, unknown> = {
      contents,
    };
    const geminiCacheConfig = resolvedAsset.cache?.gemini ?? resolvedAsset.cache?.google;

    // System instruction
    if (sections.system_instructions) {
      body.systemInstruction = {
        parts: [{ text: sections.system_instructions }],
      };
    }

    // Generation config
    const generationConfig: Record<string, unknown> = {};

    const geminiOptions = resolvedAsset.provider_options?.gemini;

    if (resolvedAsset.sampling?.temperature !== undefined) generationConfig.temperature = resolvedAsset.sampling.temperature;
    if (resolvedAsset.sampling?.top_p !== undefined) generationConfig.topP = resolvedAsset.sampling.top_p;
    if (resolvedAsset.sampling?.max_output_tokens !== undefined) generationConfig.maxOutputTokens = resolvedAsset.sampling.max_output_tokens;
    if (resolvedAsset.sampling?.stop !== undefined) generationConfig.stopSequences = resolvedAsset.sampling.stop;

    if (geminiOptions?.candidate_count !== undefined) generationConfig.candidateCount = geminiOptions.candidate_count;
    if (geminiOptions?.top_k !== undefined) generationConfig.topK = geminiOptions.top_k;
    if (geminiOptions?.seed !== undefined) generationConfig.seed = geminiOptions.seed;
    if (geminiOptions?.response_modalities !== undefined) generationConfig.responseModalities = geminiOptions.response_modalities;

    if (resolvedAsset.response?.schema !== undefined) generationConfig.responseJsonSchema = resolvedAsset.response.schema;
    if (geminiOptions?.response_schema !== undefined) generationConfig.responseSchema = geminiOptions.response_schema;
    if (geminiOptions?.response_json_schema !== undefined) generationConfig.responseJsonSchema = geminiOptions.response_json_schema;

    if (resolvedAsset.response?.format === 'json') {
      generationConfig.responseMimeType = 'application/json';
    }

    // Thinking config
    if (geminiOptions?.thinking_budget_tokens !== undefined) {
      body.thinkingConfig = {
        thinkingBudget: geminiOptions.thinking_budget_tokens,
      };
    } else if (resolvedAsset.reasoning?.effort) {
      body.thinkingConfig = {
        thinkingBudget: resolvedAsset.reasoning.effort === 'high' ? 8192 : resolvedAsset.reasoning.effort === 'medium' ? 4096 : 1024,
      };
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    if (geminiCacheConfig?.cached_content) {
      body.cachedContent = geminiCacheConfig.cached_content;
    }

    // Tools
    if (resolvedAsset.tools && resolvedAsset.tools.length > 0) {
      const functionDeclarations = resolvedAsset.tools.map((tool) => {
        if (typeof tool === 'string') {
          const def = runtime.toolRegistry?.[tool];
          if (def) return def;
          return { name: tool };
        }
        return {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        };
      });
      body.tools = [{ functionDeclarations }];
    }

    return {
      body: applyRawProviderBody(body, resolvedAsset, 'gemini'),
      provider: 'gemini',
      model: resolvedAsset.model ?? 'unknown',
    };
  },
});
