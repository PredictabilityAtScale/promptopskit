import type { ResolvedPromptAsset, PromptAssetOverrides } from '../schema/index.js';
import type { PromptResolutionMode } from '../prompt-resolution.js';
import type {
  PromptCompressionResult,
  PromptCompressionSummary,
  TheTokenCompanyRuntimeOptions,
} from '../compression.js';

/**
 * Provider-shaped request body output.
 */
export interface ProviderRequest {
  body: Record<string, unknown>;
  provider: string;
  model: string;
  baseURL?: string;
  headers?: Record<string, string>;
  compression?: PromptCompressionResult[];
  compressionSummary?: PromptCompressionSummary;
  warnings?: string[];
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


export interface OpenAIResponsesRuntimeOptions {
  previous_response_id?: string;
  conversation?: string;
  instructions?: string;
  parallel_tool_calls?: boolean;
  max_tool_calls?: number;
  include?: string[];
  metadata?: Record<string, string>;
  store?: boolean;
  background?: boolean;
}

/**
 * Credentials used for LLMAsAService gateway requests.
 */
export interface LLMAsAServiceRuntimeOptions {
  apiKey: string;
}

export interface RuntimeHistoryMessage {
  role: string;
  content: string;
}

export interface RuntimeHistoryCompactionInfo {
  promptId: string;
  maxItems: number;
  overflow: RuntimeHistoryMessage[];
  preserved: RuntimeHistoryMessage[];
  history: RuntimeHistoryMessage[];
}

export type RuntimeHistoryCompactionResult = string | RuntimeHistoryMessage;

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
  history?: RuntimeHistoryMessage[];
  onHistoryCompaction?: (info: RuntimeHistoryCompactionInfo) => RuntimeHistoryCompactionResult;
  toolRegistry?: Record<string, unknown>;
  strict?: boolean;
  openaiResponses?: OpenAIResponsesRuntimeOptions;
  llmasaservice?: LLMAsAServiceRuntimeOptions;
  theTokenCompany?: TheTokenCompanyRuntimeOptions;
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
