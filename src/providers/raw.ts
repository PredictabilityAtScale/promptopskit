import type { ResolvedPromptAsset } from '../schema/index.js';

export function applyRawProviderBody(
  body: Record<string, unknown>,
  asset: ResolvedPromptAsset,
  provider: 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'openrouter' | 'llmasaservice' | 'usagetap',
): Record<string, unknown> {
  const raw = getRawProviderBody(asset, provider);
  return raw ? { ...body, ...raw } : body;
}

function getRawProviderBody(
  asset: ResolvedPromptAsset,
  provider: 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'openrouter' | 'llmasaservice' | 'usagetap',
): Record<string, unknown> | undefined {
  if (provider === 'openai-responses') {
    return asset.raw?.['openai-responses'] ?? asset.raw?.openai_responses;
  }
  if (provider === 'gemini') {
    return asset.raw?.gemini ?? asset.raw?.google;
  }
  return asset.raw?.[provider];
}
