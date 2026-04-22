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

export interface ProviderPromptReturnMessageResult {
  provider: string;
  model: string;
  body?: undefined;
  returnMessage: string;
}

export type ProviderPromptRenderResult = ProviderRequest | ProviderPromptReturnMessageResult;

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
  onContextOverflow?: (info: {
    promptId: string;
    variable: string;
    value: string;
    maxSize: number;
    actualSize: number;
  }) => string;
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
  (asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): Promise<ProviderPromptRenderResult>;
  (lookup: ProviderPromptLookup, runtime: RuntimeRenderOptions): Promise<ProviderPromptRenderResult>;
  (source: ProviderInlinePromptSource, runtime: RuntimeRenderOptions): Promise<ProviderPromptRenderResult>;
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
