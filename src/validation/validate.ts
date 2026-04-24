import { PromptAssetSchema } from '../schema/index.js';
import type { PromptAsset } from '../schema/index.js';
import { extractVariables } from '../renderer/index.js';
import { resolveIncludes } from '../composition/index.js';
import {
  compileContextRegex,
  getContextInputs,
  getContextInputNames,
} from '../context.js';
import { levenshtein } from './levenshtein.js';

export interface ValidationError {
  code: string;
  message: string;
  filePath?: string;
  suggestion?: string;
}

export interface PromptValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

const KNOWN_FRONT_MATTER_KEYS = new Set([
  'id', 'schema_version', 'description', 'provider', 'model', 'fallback_models',
  'reasoning', 'sampling', 'response', 'tools', 'mcp', 'context', 'includes',
  'environments', 'tiers', 'metadata', 'cache', 'provider_options',
]);

const RISKY_UNBOUNDED_INPUT_NAMES = [
  'message',
  'prompt',
  'history',
  'transcript',
  'document',
  'content',
  'input',
  'body',
  'context',
];

/**
 * Validate a parsed prompt asset, returning all errors and warnings.
 */
export function validateAsset(
  asset: PromptAsset,
  frontMatterKeys?: string[],
  filePath?: string,
): PromptValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Schema validation
  const result = PromptAssetSchema.safeParse(asset);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        code: 'POK001',
        message: `Schema error at ${issue.path.join('.')}: ${issue.message}`,
        filePath,
      });
    }
  }

  // Missing id
  if (!asset.id) {
    errors.push({
      code: 'POK002',
      message: 'Missing required field: "id"',
      filePath,
    });
  }

  // Missing body sections
  if (!asset.sections?.system_instructions && !asset.sections?.prompt_template) {
    errors.push({
      code: 'POK003',
      message: 'Prompt must have at least one body section (System instructions or Prompt template)',
      filePath,
    });
  }

  // Unknown front matter keys with "did you mean?"
  if (frontMatterKeys) {
    for (const key of frontMatterKeys) {
      if (!KNOWN_FRONT_MATTER_KEYS.has(key)) {
        const suggestion = findClosestMatch(key, KNOWN_FRONT_MATTER_KEYS);
        warnings.push({
          code: 'POK010',
          message: `Unknown front matter field: "${key}"`,
          filePath,
          suggestion: suggestion ? `Did you mean "${suggestion}"?` : undefined,
        });
      }
    }
  }

  // Variable validation: used but not declared
  const declaredInputs = new Set(getContextInputNames(asset));
  const usedVars = new Set<string>();

  if (asset.sections?.system_instructions) {
    for (const v of extractVariables(asset.sections.system_instructions)) {
      usedVars.add(v);
    }
  }
  if (asset.sections?.prompt_template) {
    for (const v of extractVariables(asset.sections.prompt_template)) {
      usedVars.add(v);
    }
  }

  for (const v of usedVars) {
    if (!declaredInputs.has(v)) {
      warnings.push({
        code: 'POK011',
        message: `Variable "{{ ${v} }}" is used but not declared in context.inputs`,
        filePath,
      });
    }
  }

  // Declared but unused
  for (const v of declaredInputs) {
    if (!usedVars.has(v)) {
      warnings.push({
        code: 'POK012',
        message: `Variable "${v}" is declared in context.inputs but never used`,
        filePath,
      });
    }
  }

  if (usedVars.size > 0 && (!asset.context?.inputs || asset.context.inputs.length === 0)) {
    warnings.push({
      code: 'POK046',
      message: `Template uses ${usedVars.size === 1 ? 'a variable' : 'variables'} but context.inputs is not declared.`,
      filePath,
      suggestion: 'Declare context.inputs to enable input policy validation.',
    });
  }

  // Context regex definitions compile successfully
  for (const input of getContextInputs(asset)) {
    const lowerName = input.name.toLowerCase();

    if (input.max_size === undefined && RISKY_UNBOUNDED_INPUT_NAMES.some((needle) => lowerName.includes(needle))) {
      warnings.push({
        code: 'POK040',
        message: `Context input "${input.name}" has no max_size and appears unbounded.`,
        filePath,
        suggestion: 'Add max_size to constrain prompt payload growth.',
      });
    }

    if (
      input.allow_regex === undefined
      && input.deny_regex === undefined
      && input.non_empty === undefined
      && input.reject_secrets === undefined
    ) {
      warnings.push({
        code: 'POK041',
        message: `Context input "${input.name}" has no input hardening validators.`,
        filePath,
        suggestion: 'Consider non_empty/reject_secrets and allow/deny regex validators.',
      });
    }

    if (input.trim !== undefined && input.trim !== false && input.max_size === undefined) {
      warnings.push({
        code: 'POK014',
        message: `Context input "${input.name}" sets trim but has no max_size; trim-to-budget will be skipped.`,
        filePath,
      });
    }

    const checks: Array<{
      regex: NonNullable<typeof input.allow_regex>;
      kind: 'allow_regex' | 'deny_regex';
    }> = [];

    if (input.allow_regex) checks.push({ regex: input.allow_regex, kind: 'allow_regex' });
    if (input.deny_regex) checks.push({ regex: input.deny_regex, kind: 'deny_regex' });

    for (const check of checks) {
      try {
        compileContextRegex(check.regex, {
          promptId: asset.id,
          variable: input.name,
          field: check.kind,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message.replace(/^POK013:\s*/, '') : String(error);
        errors.push({
          code: 'POK013',
          message: reason,
          filePath,
        });
      }
    }
  }

  if (asset.provider) {
    let providerCache: unknown;
    let cacheSuggestionField: string | undefined;

    switch (asset.provider) {
      case 'openai':
        providerCache = asset.cache?.openai;
        cacheSuggestionField = 'cache.openai';
        break;
      case 'anthropic':
        providerCache = asset.cache?.anthropic;
        cacheSuggestionField = 'cache.anthropic';
        break;
      case 'gemini':
      case 'google':
        providerCache = asset.cache?.gemini ?? asset.cache?.google;
        cacheSuggestionField = 'cache.gemini';
        break;
      default:
        break;
    }

    if (cacheSuggestionField && providerCache === undefined) {
      warnings.push({
        code: 'POK042',
        message: `Provider "${asset.provider}" has no provider-specific cache settings.`,
        filePath,
        suggestion: `Consider configuring ${cacheSuggestionField} for better cache-hit behavior.`,
      });
    }

    if (!asset.model) {
      warnings.push({
        code: 'POK044',
        message: `Provider "${asset.provider}" is configured without a model.`,
        filePath,
        suggestion: 'Set model in prompt or defaults to avoid adapter-time errors.',
      });
    }
  }

  if (
    asset.cache?.gemini?.cached_content
    && asset.cache.google?.cached_content
    && asset.cache.gemini.cached_content !== asset.cache.google.cached_content
  ) {
    warnings.push({
      code: 'POK043',
      message: 'cache.gemini.cached_content and cache.google.cached_content are both set to different values.',
      filePath,
      suggestion: 'Use one canonical value; Gemini prefers cache.gemini.cached_content.',
    });
  }

  for (const [envName, overrides] of Object.entries(asset.environments ?? {})) {
    if (asset.cache && (!isRecord(overrides) || !overrides.cache)) {
      warnings.push({
        code: 'POK045',
        message: `Environment "${envName}" does not override cache while prompt-level cache is defined.`,
        filePath,
        suggestion: 'Confirm cache strategy is intentionally shared across environments.',
      });
    }
  }

  for (const [tierName, overrides] of Object.entries(asset.tiers ?? {})) {
    if (asset.cache && (!isRecord(overrides) || !overrides.cache)) {
      warnings.push({
        code: 'POK045',
        message: `Tier "${tierName}" does not override cache while prompt-level cache is defined.`,
        filePath,
        suggestion: 'Confirm cache strategy is intentionally shared across tiers.',
      });
    }
  }

  for (const tool of asset.tools ?? []) {
    if (isRecord(tool)) {
      if (!tool.description) {
        warnings.push({
          code: 'POK047',
          message: `Inline tool "${tool.name}" is missing a description.`,
          filePath,
          suggestion: 'Add description to improve model tool-selection quality.',
        });
      }
      if (!tool.input_schema) {
        warnings.push({
          code: 'POK047',
          message: `Inline tool "${tool.name}" is missing input_schema.`,
          filePath,
          suggestion: 'Add input_schema so tool inputs are strongly typed.',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a prompt asset including its include graph.
 * Catches missing include files, circular includes, and parse errors in included files.
 */
export async function validateAssetWithIncludes(
  asset: PromptAsset,
  filePath: string,
  frontMatterKeys?: string[],
): Promise<PromptValidationResult> {
  // Run standard validation first
  const result = validateAsset(asset, frontMatterKeys, filePath);

  // Validate includes
  if (asset.includes && asset.includes.length > 0) {
    try {
      await resolveIncludes(asset, filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isCircular = message.includes('Circular include');
      result.errors.push({
        code: isCircular ? 'POK021' : 'POK020',
        message: isCircular
          ? `Circular include detected: ${message}`
          : `Include resolution failed: ${message}`,
        filePath,
      });
      result.valid = false;
    }
  }

  return result;
}

function findClosestMatch(input: string, candidates: Set<string>): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
