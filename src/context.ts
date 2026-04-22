import type { PromptAsset, ResolvedPromptAsset, ContextInputDefinition } from './schema/index.js';

export interface NormalizedContextInput {
  name: string;
  max_size?: number;
  trim?: boolean | 'start' | 'end' | 'both';
  regex?: string;
  allow_regex?: string;
  deny_regex?: string;
}

export interface ContextSizeWarning {
  variable: string;
  maxSize: number;
  actualSize: number;
}

export interface ContextOverflowInfo {
  promptId: string;
  variable: string;
  value: string;
  maxSize: number;
  actualSize: number;
}

export interface SanitizeContextOptions {
  onContextOverflow?: (info: ContextOverflowInfo) => string;
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
    trim: input.trim,
    regex: input.regex,
    allow_regex: input.allow_regex,
    deny_regex: input.deny_regex,
  };
}

type TrimMode = boolean | 'start' | 'end' | 'both';

function normalizeTrimMode(mode: TrimMode): 'start' | 'end' {
  if (mode === 'start') {
    return 'start';
  }
  return 'end';
}

function trimToMaxSize(
  value: string,
  maxSize: number,
  mode: TrimMode,
): string {
  const measured = measureContextValueSize(value);
  if (measured <= maxSize) {
    return value;
  }

  const characters = Array.from(value);
  const normalizedMode = normalizeTrimMode(mode);

  if (normalizedMode === 'start') {
    let collected = '';
    let size = 0;
    for (let i = characters.length - 1; i >= 0; i -= 1) {
      const next = characters[i];
      const charSize = measureContextValueSize(next);
      if (size + charSize > maxSize) {
        break;
      }
      collected = next + collected;
      size += charSize;
    }
    return collected;
  }

  let collected = '';
  let size = 0;
  for (const char of characters) {
    const charSize = measureContextValueSize(char);
    if (size + charSize > maxSize) {
      break;
    }
    collected += char;
    size += charSize;
  }
  return collected;
}

export function sanitizeContextVariables(
  asset: Pick<PromptAsset | ResolvedPromptAsset, 'context' | 'id'>,
  variables: Record<string, string> = {},
  options: SanitizeContextOptions = {},
): Record<string, string> {
  const { onContextOverflow } = options;
  const sanitized = { ...variables };

  for (const input of getContextInputs(asset)) {
    const value = sanitized[input.name];
    if (value === undefined) {
      continue;
    }

    let candidate = value;

    if (input.max_size !== undefined) {
      const actualSize = measureContextValueSize(candidate);
      if (actualSize > input.max_size && onContextOverflow) {
        candidate = onContextOverflow({
          promptId: asset.id,
          variable: input.name,
          value: candidate,
          maxSize: input.max_size,
          actualSize,
        });
      }
    }

    if (input.trim !== undefined) {
      const trimMode = input.trim;
      if (input.max_size !== undefined) {
        candidate = trimToMaxSize(candidate, input.max_size, trimMode);
      }
    }

    sanitized[input.name] = candidate;

    const allowRegex = input.allow_regex ?? input.regex;
    if (allowRegex) {
      const candidate = sanitized[input.name];
      const matcher = new RegExp(allowRegex);
      if (!matcher.test(candidate)) {
        throw new Error(
          `POK031: Context variable "${input.name}" failed allow_regex validation for prompt "${asset.id}".`,
        );
      }
    }

    if (input.deny_regex) {
      const candidate = sanitized[input.name];
      const matcher = new RegExp(input.deny_regex);
      if (matcher.test(candidate)) {
        throw new Error(
          `POK032: Context variable "${input.name}" matched deny_regex for prompt "${asset.id}".`,
        );
      }
    }
  }

  return sanitized;
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
