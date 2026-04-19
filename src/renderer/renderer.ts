import type { ResolvedPromptAsset } from '../schema/index.js';
import { interpolate, extractVariables } from './interpolate.js';

export interface RenderOptions {
  variables?: Record<string, string>;
  strict?: boolean;
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

  const result: RenderedSections = {};

  if (asset.sections.system_instructions) {
    result.system_instructions = interpolate(
      asset.sections.system_instructions,
      variables,
      { strict },
    );
  }

  if (asset.sections.prompt_template) {
    result.prompt_template = interpolate(
      asset.sections.prompt_template,
      variables,
      { strict },
    );
  }

  return result;
}

/**
 * Get all variable names used across all sections.
 */
export function getRequiredVariables(asset: ResolvedPromptAsset): string[] {
  const vars = new Set<string>();

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

  return [...vars];
}
