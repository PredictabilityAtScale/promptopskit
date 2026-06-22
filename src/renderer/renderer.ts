import type { ResolvedPromptAsset } from '../schema/index.js';
import { interpolate, extractVariables } from './interpolate.js';
import { getContextInputs } from '../context.js';
import {
  compressHeuristicText,
  estimateHeuristicTokens,
  type HeuristicCompressionOptions,
  type HeuristicCompressionOutput,
} from '../token-compression.js';
import { tryJsonToToon } from '../toon-encoding.js';
import {
  compactCode,
  type CodeCompactionOptions,
  type CodeCompactionOutput,
} from '../code-compaction.js';

export interface RenderOptions {
  variables?: Record<string, string>;
  strict?: boolean;
  compression?: RenderCompressionOptions;
}

export interface RenderCompressionOptions {
  onHeuristicCompression?: (event: HeuristicPlaceholderCompressionEvent) => void;
  onCodeCompaction?: (event: CodePlaceholderCompactionEvent) => void;
  onCompressionWarning?: (warning: string) => void;
}

export interface HeuristicPlaceholderCompressionEvent extends HeuristicCompressionOutput {
  scope: 'placeholder';
  variable: string;
}

export interface CodePlaceholderCompactionEvent extends CodeCompactionOutput {
  scope: 'placeholder';
  variable: string;
}

export interface RenderedSections {
  system_instructions?: string;
  prompt_template?: string;
}

/**
 * Render the sections of a resolved prompt asset with variable interpolation.
 */
export function renderSections(
  asset: ResolvedPromptAsset,
  options: RenderOptions = {},
): RenderedSections {
  const { variables = {}, strict = false } = options;
  const contextInputs = getContextInputs(asset);
  const optionalVariables = contextInputs
    .filter((input) => input.optional === true)
    .map((input) => input.name);
  const contextInputsByName = new Map(contextInputs.map((input) => [input.name, input]));
  const compressionCache = new Map<string, string>();

  const createTransformVariable = (template: string) => {
    return ({ name, value, modifier, match }: {
      name: string;
      value: string;
      modifier?: 'compress' | 'toon' | 'compact' | 'code';
      match: string;
    }): string => {
      const input = contextInputsByName.get(name);
      const configuredHeuristic = input?.compression?.heuristic;
      const configuredCode = input?.compression?.code;
      const shouldCompactCode = modifier === 'compact' || modifier === 'code' || configuredCode?.enabled === true;
      const shouldCompress = modifier === 'compress' || configuredHeuristic?.enabled === true;

      if (modifier === 'toon') {
        const result = toToonPlaceholder(value);
        if (!result) {
          options.compression?.onCompressionWarning?.(
            `POK031: JSON-to-TOON skipped for placeholder "${name}" because the value is not a complete valid JSON object or array.`,
          );
          return value;
        }

        if (result.tokensSaved > 0 || result.output !== value) {
          options.compression?.onHeuristicCompression?.({
            scope: 'placeholder',
            variable: name,
            ...result,
          });
        }

        return result.output;
      }

      if (shouldCompactCode) {
        const result = compactCode(value, toCodeCompactionOptions(configuredCode));

        if (result.tokensSaved > 0 || result.output !== value) {
          options.compression?.onCodeCompaction?.({
            scope: 'placeholder',
            variable: name,
            ...result,
          });
        }

        return result.output;
      }

      if (!shouldCompress) {
        return value;
      }

      const query = resolveHeuristicQuery(configuredHeuristic, variables, template, match);
      const compressionOptions: HeuristicCompressionOptions = {
        min_tokens: configuredHeuristic?.min_tokens,
        max_sentences: configuredHeuristic?.max_sentences,
        target_reduction: configuredHeuristic?.target_reduction,
        query,
        json_to_toon: configuredHeuristic?.json_to_toon,
        mode: configuredHeuristic?.mode,
        preserve_neighbors: configuredHeuristic?.preserve_neighbors,
        fail_on_low_confidence: configuredHeuristic?.fail_on_low_confidence,
      };
      const cacheKey = JSON.stringify([name, value, compressionOptions]);
      const cached = compressionCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const result = compressHeuristicText(value, compressionOptions);
      compressionCache.set(cacheKey, result.output);

      reportHeuristicCompressionWarnings(options, result, `placeholder "${name}"`);

      if (result.tokensSaved > 0 || result.output !== value) {
        options.compression?.onHeuristicCompression?.({
          scope: 'placeholder',
          variable: name,
          ...result,
        });
      }

      return result.output;
    };
  };

  const result: RenderedSections = {};

  if (asset.sections.system_instructions) {
    result.system_instructions = interpolate(
      asset.sections.system_instructions,
      variables,
      {
        strict,
        optionalVariables,
        transformVariable: createTransformVariable(asset.sections.system_instructions),
      },
    );
  }

  if (asset.sections.prompt_template) {
    result.prompt_template = interpolate(
      asset.sections.prompt_template,
      variables,
      {
        strict,
        optionalVariables,
        transformVariable: createTransformVariable(asset.sections.prompt_template),
      },
    );
  }

  return result;
}

function resolveHeuristicQuery(
  options: (HeuristicCompressionOptions & { query_variable?: string }) | undefined,
  variables: Record<string, string>,
  template: string,
  match: string,
): string {
  if (options?.query !== undefined) {
    return options.query;
  }

  if (options?.query_variable && variables[options.query_variable] !== undefined) {
    return variables[options.query_variable];
  }

  return template.replace(match, ' ');
}

function toToonPlaceholder(value: string): HeuristicCompressionOutput | undefined {
  const toon = tryJsonToToon(value);
  if (!toon) {
    return undefined;
  }

  const inputTokens = estimateHeuristicTokens(value);
  const outputTokens = estimateHeuristicTokens(toon.output);

  return {
    output: toon.output,
    inputTokens,
    outputTokens,
    tokensSaved: Math.max(0, inputTokens - outputTokens),
    compressionRatio: outputTokens === 0 ? 0 : inputTokens / outputTokens,
    outputFormat: 'toon',
  };
}

function toCodeCompactionOptions(options: CodeCompactionOptions | undefined): CodeCompactionOptions {
  return {
    remove_comments: options?.remove_comments,
    trim_indentation: options?.trim_indentation,
    collapse_blank_lines: options?.collapse_blank_lines,
  };
}

function reportHeuristicCompressionWarnings(
  options: RenderOptions,
  result: Pick<HeuristicCompressionOutput, 'warnings'>,
  scope: string,
): void {
  for (const warning of result.warnings ?? []) {
    options.compression?.onCompressionWarning?.(`POK031: ${warning} Scope: ${scope}.`);
  }
}

/**
 * Get all variable names used across all sections.
 */
export function getRequiredVariables(asset: ResolvedPromptAsset): string[] {
  const vars = new Set<string>();
  const optionalVariables = new Set(
    getContextInputs(asset)
      .filter((input) => input.optional === true)
      .map((input) => input.name),
  );

  if (asset.sections.system_instructions) {
    for (const v of extractVariables(asset.sections.system_instructions)) {
      vars.add(v);
    }
  }

  if (asset.sections.prompt_template) {
    for (const v of extractVariables(asset.sections.prompt_template)) {
      vars.add(v);
    }
  }

  return [...vars].filter((variable) => !optionalVariables.has(variable));
}
