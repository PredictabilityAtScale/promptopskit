import { PromptAssetSchema } from '../schema/index.js';
import type { PromptAsset } from '../schema/index.js';
import { extractVariables } from '../renderer/index.js';
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
  'environments', 'tiers', 'metadata',
]);

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
  const declaredInputs = new Set(asset.context?.inputs ?? []);
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
    if (declaredInputs.size > 0 && !declaredInputs.has(v)) {
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

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
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
