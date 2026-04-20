import type { PromptAsset, ResolvedPromptAsset, ContextInputDefinition } from './schema/index.js';

export interface NormalizedContextInput {
  name: string;
  max_size?: number;
}

export interface ContextSizeWarning {
  variable: string;
  maxSize: number;
  actualSize: number;
}

const textEncoder = new TextEncoder();

export function getContextInputs(
  asset: Pick<PromptAsset | ResolvedPromptAsset, 'context'>,
): NormalizedContextInput[] {
  return (asset.context?.inputs ?? []).map(normalizeContextInput);
}

export function getContextInputNames(
  asset: Pick<PromptAsset | ResolvedPromptAsset, 'context'>,
): string[] {
  return getContextInputs(asset).map((input) => input.name);
}

export function normalizeContextInput(input: ContextInputDefinition): NormalizedContextInput {
  if (typeof input === 'string') {
    return { name: input };
  }

  return {
    name: input.name,
    max_size: input.max_size,
  };
}

export function measureContextValueSize(value: string): number {
  return textEncoder.encode(value).length;
}

export function collectContextSizeWarnings(
  asset: Pick<PromptAsset | ResolvedPromptAsset, 'context'>,
  variables: Record<string, string> = {},
): ContextSizeWarning[] {
  const warnings: ContextSizeWarning[] = [];

  for (const input of getContextInputs(asset)) {
    if (input.max_size === undefined) {
      continue;
    }

    const value = variables[input.name];
    if (value === undefined) {
      continue;
    }

    const actualSize = measureContextValueSize(value);
    if (actualSize > input.max_size) {
      warnings.push({
        variable: input.name,
        maxSize: input.max_size,
        actualSize,
      });
    }
  }

  return warnings;
}