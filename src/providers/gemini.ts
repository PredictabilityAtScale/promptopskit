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

    if (resolvedAsset.sampling?.temperature !== undefined) generationConfig.temperature = resolvedAsset.sampling.temperature;
    if (resolvedAsset.sampling?.top_p !== undefined) generationConfig.topP = resolvedAsset.sampling.top_p;
    if (resolvedAsset.sampling?.max_output_tokens !== undefined) generationConfig.maxOutputTokens = resolvedAsset.sampling.max_output_tokens;
    if (resolvedAsset.sampling?.stop !== undefined) generationConfig.stopSequences = resolvedAsset.sampling.stop;

    if (resolvedAsset.response?.format === 'json') {
      generationConfig.responseMimeType = 'application/json';
    }

    // Thinking config
    if (resolvedAsset.reasoning?.effort) {
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
      body,
      provider: 'gemini',
      model: resolvedAsset.model ?? 'unknown',
    };
  },
});
