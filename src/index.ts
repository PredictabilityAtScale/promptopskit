import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { parsePrompt, loadPromptFile } from './parser/index.js';
import { resolveIncludes } from './composition/index.js';
import { applyOverrides } from './overrides/index.js';
import { renderSections } from './renderer/index.js';
import { getAdapter } from './providers/index.js';
import { validateAsset, validateAssetWithIncludes } from './validation/index.js';
import { PromptCache } from './cache.js';
import { collectContextSizeWarnings, sanitizeContextVariables } from './context.js';
import { compactHistoryForPrompt } from './history.js';
import {
  DEFAULT_PROMPTS_DIR,
  loadPromptAsset,
  resolveInlinePromptSource,
  resolvePromptAsset,
  withPromptResolutionDefaults,
} from './prompt-resolution.js';
import type { PromptAsset, PromptAssetOverrides, ResolvedPromptAsset } from './schema/index.js';
import type { ProviderRequest, RuntimeRenderOptions } from './providers/types.js';
import type { PromptValidationResult } from './validation/index.js';

// --- Re-exports ---
export type { PromptAsset, ResolvedPromptAsset } from './schema/index.js';
export type {
  ProviderRequest,
  ProviderPromptRenderResult,
  RuntimeRenderOptions,
  RuntimeHistoryCompactionInfo,
  RuntimeHistoryCompactionResult,
  RuntimeHistoryMessage,
  ProviderAdapter,
  ProviderInlinePromptSource,
  ProviderPromptInput,
  ProviderPromptLookup,
  ValidationResult,
} from './providers/types.js';
export type { PromptValidationResult, ValidationError } from './validation/index.js';
export type { RenderedSections, RenderOptions } from './renderer/index.js';
export type { ParseResult } from './parser/index.js';
export type { OverrideOptions } from './overrides/index.js';
export type {
  UsageTapAllowed,
  UsageTapAllowedCapability,
  UsageTapBeginRequest,
  UsageTapBeginResponse,
  UsageTapCallOptions,
  UsageTapCallResult,
  UsageTapClient,
  UsageTapClientConfig,
  UsageTapEndRequest,
  UsageTapEndResponse,
  UsageTapEndUsage,
  UsageTapEntitlementMode,
  UsageTapEntitlementOptions,
  UsageTapErrorPayload,
  UsageTapInvokeContext,
  UsageTapInvokeResult,
  UsageTapProviderRunOptions,
  UsageTapProviderRunResult,
  UsageTapReasoningLevel,
} from './usagetap/index.js';

export { parsePrompt, loadPromptFile, extractSections } from './parser/index.js';
export { interpolate, extractVariables } from './renderer/index.js';
export { resolveIncludes } from './composition/index.js';
export { applyOverrides } from './overrides/index.js';
export { validateAsset, validateAssetWithIncludes } from './validation/index.js';
export { getAdapter, openaiAdapter, openaiResponsesAdapter } from './providers/index.js';
export { anthropicAdapter } from './providers/anthropic.js';
export { geminiAdapter } from './providers/gemini.js';
export { openrouterAdapter } from './providers/openrouter.js';
export { PromptAssetSchema, PromptAssetOverridesSchema } from './schema/index.js';
export {
  applyUsageTapEntitlements,
  beginUsageTapCall,
  createUsageTapClient,
  defaultUsageTapErrorMapper,
  endUsageTapCall,
  extractAnthropicUsage,
  extractGeminiUsage,
  extractOpenAIUsage,
  runAnthropicWithUsageTap,
  runGeminiWithUsageTap,
  runOpenAIWithUsageTap,
  runOpenRouterWithUsageTap,
  withUsageTapCall,
} from './usagetap/index.js';

// --- Config ---

export interface PromptOpsKitConfig {
  sourceDir?: string;
  compiledDir?: string;
  mode?: 'auto' | 'compiled-only' | 'source-only';
  cache?: boolean;
  warnings?: {
    contextSize?: 'auto' | 'off' | 'result-only' | 'console' | 'console-and-result';
  };
}

// --- Render options ---

export interface RenderPromptOptions {
  /** Prompt path (no extension), e.g. 'support/reply' */
  path?: string;
  /** Inline prompt source string (alternative to path) */
  source?: string;
  /** Provider name */
  provider: string;
  /** Environment override */
  environment?: string;
  /** Tier override */
  tier?: string;
  /** Runtime overrides applied after environment and tier */
  runtime?: Partial<PromptAssetOverrides>;
  /** Variables for interpolation */
  variables?: Record<string, string>;
  /** Optional callback to transform oversized context values before warnings/rendering */
  onContextOverflow?: RuntimeRenderOptions['onContextOverflow'];
  /** Conversation history */
  history?: RuntimeRenderOptions['history'];
  /** Optional callback to compact history overflow when context.history.max_items is exceeded */
  onHistoryCompaction?: RuntimeRenderOptions['onHistoryCompaction'];
  /** Tool registry for resolving tool references */
  toolRegistry?: Record<string, unknown>;
  /** Strict mode — fail on missing variables */
  strict?: boolean;
  /** OpenAI Responses API-specific request options */
  openaiResponses?: RuntimeRenderOptions['openaiResponses'];
}

// --- Result ---

export interface RenderResult {
  resolved: ResolvedPromptAsset;
  request?: ProviderRequest;
  returnMessage?: string;
  warnings: string[];
}

function shouldIncludeContextWarningsInResult(
  policy: NonNullable<PromptOpsKitConfig['warnings']>['contextSize'] | undefined,
): boolean {
  return policy === undefined
    || policy === 'auto'
    || policy === 'result-only'
    || policy === 'console-and-result';
}

function shouldLogContextWarnings(
  policy: NonNullable<PromptOpsKitConfig['warnings']>['contextSize'] | undefined,
  options: Pick<RenderPromptOptions, 'source'>,
  mode: PromptOpsKitConfig['mode'],
): boolean {
  if (policy === 'off' || policy === 'result-only') {
    return false;
  }

  if (policy === 'console' || policy === 'console-and-result') {
    return true;
  }

  return Boolean(options.source || mode !== 'compiled-only');
}

function formatContextSizeWarning(
  asset: ResolvedPromptAsset,
  warning: { variable: string; maxSize: number; actualSize: number },
): string {
  return [
    'POK030:',
    `Context variable "${warning.variable}" exceeded max_size`,
    `for prompt "${asset.id}"`,
    `(${warning.actualSize} bytes > ${warning.maxSize} bytes).`,
  ].join(' ');
}

// --- Main class ---

export class PromptOpsKit {
  private config: Required<Pick<PromptOpsKitConfig, 'sourceDir' | 'mode'>> & PromptOpsKitConfig;
  private promptCache: PromptCache<PromptAsset>;

  constructor(config: PromptOpsKitConfig) {
    const resolvedConfig = withPromptResolutionDefaults(config);
    this.config = {
      ...resolvedConfig,
      mode: resolvedConfig.mode ?? 'auto',
      cache: resolvedConfig.cache ?? true,
    };
    this.promptCache = new PromptCache();
  }

  /**
   * Load a prompt asset from compiled or source, based on mode.
   */
  async loadPrompt(promptPath: string): Promise<PromptAsset> {
    return loadPromptAsset(promptPath, this.config, this.promptCache);
  }

  /**
   * Resolve a prompt: load, resolve includes, apply overrides.
   */
  async resolvePrompt(
    promptPath: string,
    options: { environment?: string; tier?: string; runtime?: Partial<PromptAssetOverrides> } = {},
  ): Promise<ResolvedPromptAsset> {
    return resolvePromptAsset(promptPath, this.config, options, this.promptCache);
  }

  /**
   * Render a prompt for a specific provider.
   */
  async renderPrompt(options: RenderPromptOptions): Promise<RenderResult> {
    let resolved: ResolvedPromptAsset;

    if (options.source) {
      resolved = resolveInlinePromptSource(options.source, {
        environment: options.environment,
        tier: options.tier,
        runtime: options.runtime,
      });
    } else if (options.path) {
      resolved = await this.resolvePrompt(options.path, {
        environment: options.environment,
        tier: options.tier,
        runtime: options.runtime,
      });
    } else {
      throw new Error('Either "path" or "source" must be provided to renderPrompt()');
    }

    const adapter = getAdapter(options.provider);
    const validation = adapter.validate(resolved, {
      openaiResponses: options.openaiResponses,
    });

    if (!validation.valid) {
      throw new Error(
        `Provider validation failed for "${options.provider}":\n` +
        validation.errors.map((e) => `  - ${e}`).join('\n'),
      );
    }

    const sanitization = sanitizeContextVariables(resolved, options.variables, {
      onContextOverflow: options.onContextOverflow,
    });

    if (sanitization.shortCircuit) {
      return {
        resolved,
        returnMessage: sanitization.shortCircuit.returnMessage,
        warnings: validation.warnings,
      };
    }

    const contextSizeWarnings = collectContextSizeWarnings(resolved, sanitization.variables).map((warning) =>
      formatContextSizeWarning(resolved, warning),
    );

    const contextWarningPolicy = this.config.warnings?.contextSize;

    if (contextSizeWarnings.length > 0 && shouldLogContextWarnings(contextWarningPolicy, options, this.config.mode)) {
      for (const warning of contextSizeWarnings) {
        console.warn(`[promptopskit] Warning: ${warning}`);
      }
    }

    const request = adapter.render(resolved, {
      variables: sanitization.variables,
      history: compactHistoryForPrompt(resolved, {
        history: options.history,
        onHistoryCompaction: options.onHistoryCompaction,
      }),
      onHistoryCompaction: options.onHistoryCompaction,
      toolRegistry: options.toolRegistry,
      strict: options.strict,
      openaiResponses: options.openaiResponses,
    });

    return {
      resolved,
      request,
      warnings: shouldIncludeContextWarningsInResult(contextWarningPolicy)
        ? [...validation.warnings, ...contextSizeWarnings]
        : validation.warnings,
    };
  }

  /**
   * Validate a prompt file.
   */
  async validatePrompt(promptPath: string): Promise<PromptValidationResult> {
    const sourceFile = resolve(this.config.sourceDir, promptPath + '.md');

    try {
      const asset = await this.loadPrompt(promptPath);
      return validateAssetWithIncludes(asset, sourceFile);
    } catch (error) {
      const validationError = toPromptValidationError(error, sourceFile);
      if (validationError) {
        return {
          valid: false,
          errors: [validationError],
          warnings: [],
        };
      }

      throw error;
    }
  }

  /**
   * Clear the internal cache.
   */
  clearCache(): void {
    this.promptCache.clear();
  }
}

// --- Factory ---

export function createPromptOpsKit(config: PromptOpsKitConfig = {}): PromptOpsKit {
  return new PromptOpsKit(config);
}

function toPromptValidationError(error: unknown, filePath: string): PromptValidationResult['errors'][number] | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const match = error.message.match(/^(POK\d+):\s*(.*)$/);
  if (!match) {
    return undefined;
  }

  return {
    code: match[1],
    message: match[2],
    filePath,
  };
}

// --- Standalone convenience ---

/**
 * Standalone renderPrompt for quick usage without creating a PromptOpsKit instance.
 * Requires either `source` (inline) or `path` + implicit sourceDir of ./prompts.
 */
export async function renderPrompt(
  options: RenderPromptOptions & {
    sourceDir?: string;
    warnings?: PromptOpsKitConfig['warnings'];
  },
): Promise<RenderResult> {
  const kit = createPromptOpsKit({
    sourceDir: options.sourceDir ?? DEFAULT_PROMPTS_DIR,
    cache: false,
    warnings: options.warnings,
  });
  return kit.renderPrompt(options);
}
