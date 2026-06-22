import type { ResolvedPromptAsset } from './schema/index.js';
import { renderSections } from './renderer/index.js';
import type { RuntimeRenderOptions } from './providers/types.js';
import { getContextInputs } from './context.js';
import {
  compressHeuristicText,
  type HeuristicCompressionOptions,
} from './token-compression.js';
import {
  compactCode,
  type CodeCompactionOptions,
} from './code-compaction.js';

export const THETOKENCOMPANY_DEFAULT_MODEL = 'bear-2';
export const THETOKENCOMPANY_DEFAULT_BASE_URL = 'https://api.thetokencompany.com';
export const HEURISTIC_COMPRESSION_MODEL = 'local-heuristic-v1';
export const CODE_COMPACTION_MODEL = 'local-code-compactor-v1';

export interface TheTokenCompanyRuntimeOptions {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof fetch;
}

export interface PromptCompressionResult {
  provider: 'thetokencompany' | 'heuristic' | 'code';
  model: string;
  inputTokens: number;
  outputTokens: number;
  tokensSaved: number;
  compressionRatio: number;
  scope?: 'prompt_template' | 'placeholder';
  variable?: string;
  outputFormat?: 'toon' | 'code';
}

export interface PromptCompressionSummary {
  steps: number;
  inputTokens: number;
  outputTokens: number;
  tokensSaved: number;
  reductionRatio: number;
}

export interface PromptCompressionRenderResult {
  asset: ResolvedPromptAsset;
  runtime: RuntimeRenderOptions;
  compression: PromptCompressionResult[];
  warnings: string[];
}

interface TheTokenCompanyCompressResponse {
  output: string;
  output_tokens: number;
  input_tokens: number;
  tokens_saved: number;
  compression_ratio: number;
}

interface TheTokenCompanyRawCompressResponse extends Partial<TheTokenCompanyCompressResponse> {
  original_input_tokens?: number;
  compression_time?: number;
}

export function summarizePromptCompression(
  compression: PromptCompressionResult[] = [],
): PromptCompressionSummary {
  const totals = compression.reduce(
    (accumulator, result) => {
      accumulator.inputTokens += result.inputTokens;
      accumulator.outputTokens += result.outputTokens;
      accumulator.tokensSaved += result.tokensSaved;
      return accumulator;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      tokensSaved: 0,
    },
  );

  return {
    steps: compression.length,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    tokensSaved: totals.tokensSaved,
    reductionRatio: totals.inputTokens === 0 ? 0 : totals.tokensSaved / totals.inputTokens,
  };
}

export async function applyPromptCompressionForRender(
  asset: ResolvedPromptAsset,
  runtime: RuntimeRenderOptions,
): Promise<PromptCompressionRenderResult> {
  const theTokenCompanyConfig = asset.compression?.thetokencompany;
  const heuristicConfig = asset.compression?.heuristic;
  const codeConfig = asset.compression?.code;
  const hasTheTokenCompanyCompression = theTokenCompanyConfig?.enabled === true && Boolean(asset.sections.prompt_template);
  const hasHeuristicPromptCompression = heuristicConfig?.enabled === true && Boolean(asset.sections.prompt_template);
  const hasCodePromptCompaction = codeConfig?.enabled === true && Boolean(asset.sections.prompt_template);
  const hasPlaceholderCompression = usesPlaceholderCompression(asset);

  if (
    !hasTheTokenCompanyCompression
    && !hasHeuristicPromptCompression
    && !hasCodePromptCompaction
    && !hasPlaceholderCompression
  ) {
    return { asset, runtime, compression: [], warnings: [] };
  }

  const compression: PromptCompressionResult[] = [];
  const warnings: string[] = [];
  const sections = renderSections(asset, {
    variables: runtime.variables,
    strict: runtime.strict,
    compression: {
      onHeuristicCompression: (event) => {
        compression.push({
          provider: 'heuristic',
          model: HEURISTIC_COMPRESSION_MODEL,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          tokensSaved: event.tokensSaved,
          compressionRatio: event.compressionRatio,
          scope: event.scope,
          variable: event.variable,
          outputFormat: event.outputFormat,
        });
      },
      onCodeCompaction: (event) => {
        compression.push({
          provider: 'code',
          model: CODE_COMPACTION_MODEL,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          tokensSaved: event.tokensSaved,
          compressionRatio: event.compressionRatio,
          scope: event.scope,
          variable: event.variable,
          outputFormat: 'code',
        });
      },
      onCompressionWarning: (warning) => {
        warnings.push(warning);
      },
    },
  });

  let promptTemplate = sections.prompt_template;

  if (hasCodePromptCompaction && promptTemplate) {
    if (hasHeuristicPromptCompression) {
      warnings.push(
        'POK032: Local heuristic prompt compression skipped because compression.code is enabled for the prompt template.',
      );
    }

    const result = compactCode(promptTemplate, toCodeCompactionOptions(codeConfig));

    promptTemplate = result.output;

    if (result.tokensSaved > 0 || result.output !== sections.prompt_template) {
      compression.push({
        provider: 'code',
        model: CODE_COMPACTION_MODEL,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tokensSaved: result.tokensSaved,
        compressionRatio: result.compressionRatio,
        scope: 'prompt_template',
        outputFormat: 'code',
      });
    }
  } else if (hasHeuristicPromptCompression && promptTemplate) {
    const result = compressHeuristicText(promptTemplate, {
      min_tokens: heuristicConfig?.min_tokens,
      max_sentences: heuristicConfig?.max_sentences,
      target_reduction: heuristicConfig?.target_reduction,
      query: resolveHeuristicPromptQuery(heuristicConfig, runtime.variables, sections.system_instructions),
      json_to_toon: heuristicConfig?.json_to_toon,
      mode: heuristicConfig?.mode,
      preserve_neighbors: heuristicConfig?.preserve_neighbors,
      fail_on_low_confidence: heuristicConfig?.fail_on_low_confidence,
    });

    promptTemplate = result.output;

    reportHeuristicCompressionWarnings(warnings, result.warnings, 'prompt template');

    if (result.tokensSaved > 0 || result.output !== sections.prompt_template) {
      compression.push({
        provider: 'heuristic',
        model: HEURISTIC_COMPRESSION_MODEL,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tokensSaved: result.tokensSaved,
        compressionRatio: result.compressionRatio,
        scope: 'prompt_template',
        outputFormat: result.outputFormat,
      });
    }
  }

  if (hasTheTokenCompanyCompression && hasCodePromptCompaction && promptTemplate) {
    warnings.push(
      'POK033: TheTokenCompany compression skipped because compression.code is enabled; code is compacted locally and not text-compressed.',
    );
  } else if (hasTheTokenCompanyCompression && promptTemplate) {
    const model = theTokenCompanyConfig?.model ?? THETOKENCOMPANY_DEFAULT_MODEL;
    const result = await compressWithTheTokenCompany(promptTemplate, {
      apiKey: runtime.theTokenCompany?.apiKey,
      baseURL: runtime.theTokenCompany?.baseURL,
      fetch: runtime.theTokenCompany?.fetch,
      model,
      aggressiveness: theTokenCompanyConfig?.aggressiveness,
    });

    promptTemplate = result.output;

    compression.push({
      provider: 'thetokencompany',
      model,
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
      tokensSaved: result.tokens_saved,
      compressionRatio: result.compression_ratio,
    });
  }

  return {
    asset: {
      ...asset,
      sections: {
        ...asset.sections,
        ...sections,
        ...(promptTemplate !== undefined ? { prompt_template: promptTemplate } : {}),
      },
    },
    runtime: {
      ...runtime,
      variables: {},
      strict: false,
    },
    compression,
    warnings,
  };
}

function usesPlaceholderCompression(asset: ResolvedPromptAsset): boolean {
  const hasContextInputCompression = getContextInputs(asset).some((input) =>
    input.compression?.heuristic?.enabled === true || input.compression?.code?.enabled === true
  );

  if (hasContextInputCompression) {
    return true;
  }

  return Boolean(
    (asset.sections.system_instructions && hasCompressionModifier(asset.sections.system_instructions))
    || (asset.sections.prompt_template && hasCompressionModifier(asset.sections.prompt_template)),
  );
}

function hasCompressionModifier(template: string): boolean {
  return /\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\|\s*(?:compress|toon|compact|code)\s*\}\}/.test(template);
}

function resolveHeuristicPromptQuery(
  options: (HeuristicCompressionOptions & { query_variable?: string }) | undefined,
  variables: Record<string, string> | undefined,
  systemInstructions: string | undefined,
): string | undefined {
  if (options?.query !== undefined) {
    return options.query;
  }

  if (options?.query_variable && variables?.[options.query_variable] !== undefined) {
    return variables[options.query_variable];
  }

  return systemInstructions;
}

function toCodeCompactionOptions(options: CodeCompactionOptions | undefined): CodeCompactionOptions {
  return {
    remove_comments: options?.remove_comments,
    trim_indentation: options?.trim_indentation,
    collapse_blank_lines: options?.collapse_blank_lines,
  };
}

function reportHeuristicCompressionWarnings(
  warnings: string[],
  compressionWarnings: string[] | undefined,
  scope: string,
): void {
  for (const warning of compressionWarnings ?? []) {
    warnings.push(`POK031: ${warning} Scope: ${scope}.`);
  }
}

async function compressWithTheTokenCompany(
  input: string,
  options: {
    apiKey?: string;
    baseURL?: string;
    fetch?: typeof fetch;
    model: string;
    aggressiveness?: number;
  },
): Promise<TheTokenCompanyCompressResponse> {
  const apiKey = options.apiKey ?? getEnv('THETOKENCOMPANY_API_KEY') ?? getEnv('TTC_API_KEY');
  if (!apiKey) {
    throw new Error(
      'TheTokenCompany compression is enabled, but no API key was provided. '
      + 'Pass theTokenCompany.apiKey to renderPrompt() or set THETOKENCOMPANY_API_KEY.',
    );
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('TheTokenCompany compression requires a runtime with fetch support.');
  }

  const baseURL = (options.baseURL ?? THETOKENCOMPANY_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const compressionSettings = options.aggressiveness === undefined
    ? undefined
    : { aggressiveness: options.aggressiveness };

  const response = await fetchImpl(`${baseURL}/v1/compress`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      input,
      ...(compressionSettings ? { compression_settings: compressionSettings } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `TheTokenCompany compression failed with HTTP ${response.status}`
      + (body ? `: ${body}` : '.'),
    );
  }

  const data = await response.json() as TheTokenCompanyRawCompressResponse;
  const normalized = normalizeTheTokenCompanyCompressResponse(data);
  if (!normalized) {
    throw new Error('TheTokenCompany compression returned an invalid response payload.');
  }

  return normalized;
}

function normalizeTheTokenCompanyCompressResponse(
  data: TheTokenCompanyRawCompressResponse,
): TheTokenCompanyCompressResponse | undefined {
  if (
    typeof data.output !== 'string'
    || typeof data.output_tokens !== 'number'
  ) {
    return undefined;
  }

  const inputTokens = typeof data.input_tokens === 'number'
    ? data.input_tokens
    : data.original_input_tokens;

  if (typeof inputTokens !== 'number') {
    return undefined;
  }

  const tokensSaved = typeof data.tokens_saved === 'number'
    ? data.tokens_saved
    : inputTokens - data.output_tokens;
  const compressionRatio = typeof data.compression_ratio === 'number'
    ? data.compression_ratio
    : data.output_tokens === 0
      ? 0
      : inputTokens / data.output_tokens;

  return {
    output: data.output,
    output_tokens: data.output_tokens,
    input_tokens: inputTokens,
    tokens_saved: tokensSaved,
    compression_ratio: compressionRatio,
  };
}

function getEnv(name: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return process.env[name];
}
