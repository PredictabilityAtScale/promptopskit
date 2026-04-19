import type { ResolvedPromptAsset } from '../schema/index.js';
import type {
  ProviderAdapter,
  ProviderRequest,
  ValidationResult,
  RuntimeRenderOptions,
} from './types.js';
import { renderSections } from '../renderer/index.js';

/**
 * Google Gemini provider adapter.
 * Produces request bodies compatible with the Gemini generateContent API.
 */
export const geminiAdapter: ProviderAdapter = {
  name: 'gemini',

  validate(asset: ResolvedPromptAsset): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!asset.model) {
      errors.push('Gemini adapter requires a model to be specified.');
    }

    if (asset.sampling?.frequency_penalty !== undefined) {
      warnings.push('Gemini does not support frequency_penalty. It will be ignored.');
    }
    if (asset.sampling?.presence_penalty !== undefined) {
      warnings.push('Gemini does not support presence_penalty. It will be ignored.');
    }

    return { valid: errors.length === 0, errors, warnings };
  },

  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest {
    const sections = renderSections(asset, {
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

    // System instruction
    if (sections.system_instructions) {
      body.systemInstruction = {
        parts: [{ text: sections.system_instructions }],
      };
    }

    // Generation config
    const generationConfig: Record<string, unknown> = {};

    if (asset.sampling?.temperature !== undefined) generationConfig.temperature = asset.sampling.temperature;
    if (asset.sampling?.top_p !== undefined) generationConfig.topP = asset.sampling.top_p;
    if (asset.sampling?.max_output_tokens !== undefined) generationConfig.maxOutputTokens = asset.sampling.max_output_tokens;
    if (asset.sampling?.stop !== undefined) generationConfig.stopSequences = asset.sampling.stop;

    if (asset.response?.format === 'json') {
      generationConfig.responseMimeType = 'application/json';
    }

    // Thinking config
    if (asset.reasoning?.effort) {
      body.thinkingConfig = {
        thinkingBudget: asset.reasoning.effort === 'high' ? 8192 : asset.reasoning.effort === 'medium' ? 4096 : 1024,
      };
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    // Tools
    if (asset.tools && asset.tools.length > 0) {
      const functionDeclarations = asset.tools.map((tool) => {
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
      model: asset.model ?? 'unknown',
    };
  },
};
