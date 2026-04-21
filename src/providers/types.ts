import type { ResolvedPromptAsset, PromptAssetOverrides } from '../schema/index.js';

/**
 * Provider-shaped request body output.
 */
export interface ProviderRequest {
  body: Record<string, unknown>;
  provider: string;
  model: string;
}

/**
 * Result of validating an asset against a provider.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Options passed at render time.
 */
export interface RuntimeRenderOptions {
  environment?: string;
  tier?: string;
  runtime?: Partial<PromptAssetOverrides>;
  variables?: Record<string, string>;
  history?: Array<{ role: string; content: string }>;
  toolRegistry?: Record<string, unknown>;
  strict?: boolean;
}

/**
 * Provider adapter interface. Each provider implements this.
 */
export interface ProviderAdapter {
  name: string;
  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult;
  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest;
}
