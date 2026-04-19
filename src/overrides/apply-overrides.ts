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

  return result;
}
