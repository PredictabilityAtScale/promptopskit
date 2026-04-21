import { applyOverrides } from '../overrides/index.js';
import type { ResolvedPromptAsset } from '../schema/index.js';
import type { RuntimeRenderOptions } from './types.js';

export function resolveAssetForProvider(
  asset: ResolvedPromptAsset,
  runtime: Pick<RuntimeRenderOptions, 'environment' | 'tier' | 'runtime'> = {},
): ResolvedPromptAsset {
  if (!runtime.environment && !runtime.tier && !runtime.runtime) {
    return asset;
  }

  return applyOverrides(asset, {
    environment: runtime.environment,
    tier: runtime.tier,
    runtime: runtime.runtime,
  }) as ResolvedPromptAsset;
}