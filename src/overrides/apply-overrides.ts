import type { PromptAsset, PromptAssetOverrides } from '../schema/index.js';

export interface OverrideOptions {
  environment?: string;
  tier?: string;
  runtime?: Partial<PromptAssetOverrides>;
}

/**
 * Apply environment, tier, and runtime overrides to a prompt asset.
 *
 * Precedence: base → environment → tier → runtime
 * Scalars are replaced. Arrays are replaced (not concatenated).
 */
export function applyOverrides(
  asset: PromptAsset,
  options: OverrideOptions = {},
): PromptAsset {
  let result = { ...asset };

  // Apply environment override
  if (options.environment && result.environments?.[options.environment]) {
    result = mergeOverride(result, result.environments[options.environment]);
  }

  // Apply tier override
  if (options.tier && result.tiers?.[options.tier]) {
    result = mergeOverride(result, result.tiers[options.tier]);
  }

  // Apply runtime overrides
  if (options.runtime) {
    result = mergeOverride(result, options.runtime);
  }

  return result;
}

function mergeOverride(
  base: PromptAsset,
  override: Partial<PromptAssetOverrides>,
): PromptAsset {
  const result = { ...base };

  if (override.model !== undefined) result.model = override.model;
  if (override.fallback_models !== undefined) result.fallback_models = override.fallback_models;
  if (override.tools !== undefined) result.tools = override.tools;

  if (override.reasoning !== undefined) {
    result.reasoning = { ...result.reasoning, ...override.reasoning };
  }
  if (override.sampling !== undefined) {
    result.sampling = { ...result.sampling, ...override.sampling };
  }
  if (override.response !== undefined) {
    result.response = { ...result.response, ...override.response };
  }
  if (override.compression !== undefined) {
    result.compression = {
      ...result.compression,
      ...override.compression,
      thetokencompany: mergeRecordBlock(
        result.compression?.thetokencompany,
        override.compression.thetokencompany,
      ),
      heuristic: mergeRecordBlock(
        result.compression?.heuristic,
        override.compression.heuristic,
      ),
      code: mergeRecordBlock(
        result.compression?.code,
        override.compression.code,
      ),
    };
  }
  if (override.cache !== undefined) {
    result.cache = {
      ...result.cache,
      ...override.cache,
      openai: mergeRecordBlock(result.cache?.openai, override.cache.openai),
      anthropic: mergeRecordBlock(result.cache?.anthropic, override.cache.anthropic),
      gemini: mergeRecordBlock(result.cache?.gemini, override.cache.gemini),
      google: mergeRecordBlock(result.cache?.google, override.cache.google),
    };
  }
  if (override.raw !== undefined) {
    result.raw = {
      ...result.raw,
      ...override.raw,
      openai: mergeRecordBlock(result.raw?.openai, override.raw.openai),
      'openai-responses': mergeRecordBlock(result.raw?.['openai-responses'], override.raw['openai-responses']),
      openai_responses: mergeRecordBlock(result.raw?.openai_responses, override.raw.openai_responses),
      anthropic: mergeRecordBlock(result.raw?.anthropic, override.raw.anthropic),
      gemini: mergeRecordBlock(result.raw?.gemini, override.raw.gemini),
      google: mergeRecordBlock(result.raw?.google, override.raw.google),
      openrouter: mergeRecordBlock(result.raw?.openrouter, override.raw.openrouter),
      llmasaservice: mergeRecordBlock(result.raw?.llmasaservice, override.raw.llmasaservice),
    };
  }

  if (override.provider_options !== undefined) {
    result.provider_options = {
      ...result.provider_options,
      ...override.provider_options,
      anthropic: {
        ...result.provider_options?.anthropic,
        ...override.provider_options.anthropic,
      },
      gemini: {
        ...result.provider_options?.gemini,
        ...override.provider_options.gemini,
      },
      openrouter: {
        ...result.provider_options?.openrouter,
        ...override.provider_options.openrouter,
      },
      llmasaservice: {
        ...result.provider_options?.llmasaservice,
        ...override.provider_options.llmasaservice,
      },
    };
  }

  return result;
}

function mergeRecordBlock<T extends object>(
  base: T | undefined,
  override: T | undefined,
): T | undefined {
  if (override === undefined) return base;
  return { ...base, ...override } as T;
}
