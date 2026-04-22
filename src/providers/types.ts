import type { ResolvedPromptAsset, PromptAssetOverrides } from '../schema/index.js';
import type { PromptResolutionMode } from '../prompt-resolution.js';

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

export interface ProviderPromptLookup {
  path: string;
  sourceDir?: string;
  compiledDir?: string;
  mode?: PromptResolutionMode;
  cache?: boolean;
}

export interface ProviderInlinePromptSource {
  source: string;
}

export type ProviderPromptInput = ResolvedPromptAsset | ProviderPromptLookup | ProviderInlinePromptSource;

export interface ValidatePromptMethod {
  (asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): Promise<ValidationResult>;
  (lookup: ProviderPromptLookup, runtime?: RuntimeRenderOptions): Promise<ValidationResult>;
  (source: ProviderInlinePromptSource, runtime?: RuntimeRenderOptions): Promise<ValidationResult>;
}

export interface RenderPromptMethod {
  (asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): Promise<ProviderRequest>;
  (lookup: ProviderPromptLookup, runtime: RuntimeRenderOptions): Promise<ProviderRequest>;
  (source: ProviderInlinePromptSource, runtime: RuntimeRenderOptions): Promise<ProviderRequest>;
}

/**
 * Provider adapter interface. Each provider implements this.
 */
export interface ProviderAdapter {
  name: string;
  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult;
  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest;
  validatePrompt: ValidatePromptMethod;
  renderPrompt: RenderPromptMethod;
}
