import type {
  PromptAsset,
  ResolvedPromptAsset,
  ContextBuiltInValidatorDefinition,
  ContextInputDefinition,
  ContextRegexDefinition,
} from './schema/index.js';

export interface ContextValidationShortCircuit {
  returnMessage: string;
  code: 'POK031' | 'POK032' | 'POK033' | 'POK034';
  variable: string;
  field: 'allow_regex' | 'deny_regex' | 'non_empty' | 'reject_secrets';
}

export interface SanitizedContextVariablesResult {
  variables: Record<string, string>;
  shortCircuit?: ContextValidationShortCircuit;
}

export interface NormalizedContextRegex {
  pattern: string;
  flags: string;
  raw: string;
  invalidLiteral?: boolean;
  returnMessage?: string;
}

export interface NormalizedContextBuiltInValidator {
  returnMessage?: string;
}

export interface NormalizedContextInput {
  name: string;
  optional?: boolean;
  warnings?: boolean;
  max_size?: number;
  trim?: boolean | 'start' | 'end' | 'both';
  allow_regex?: NormalizedContextRegex;
  deny_regex?: NormalizedContextRegex;
  non_empty?: NormalizedContextBuiltInValidator;
  reject_secrets?: NormalizedContextBuiltInValidator;
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
const REJECT_SECRETS_PATTERN = '(secret|api[_-]?key|password)';
const REJECT_SECRETS_FLAGS = 'i';

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
    optional: input.optional,
    warnings: input.warnings,
    max_size: input.max_size,
    trim: input.trim,
    allow_regex: normalizeContextRegex(input.allow_regex),
    deny_regex: normalizeContextRegex(input.deny_regex),
    non_empty: normalizeBuiltInValidator(input.non_empty),
    reject_secrets: normalizeBuiltInValidator(input.reject_secrets),
  };
}

export function areContextInputWarningsEnabled(input: Pick<NormalizedContextInput, 'warnings'>): boolean {
  return input.warnings !== false;
}

export function normalizeContextRegex(
  value: ContextRegexDefinition | undefined,
): NormalizedContextRegex | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const literal = parseRegexLiteral(value);
    if (value.startsWith('/') && !literal) {
      return {
        pattern: value,
        flags: '',
        raw: value,
        invalidLiteral: true,
      };
    }

    return {
      pattern: literal?.pattern ?? value,
      flags: literal?.flags ?? '',
      raw: value,
    };
  }

  return {
    pattern: value.pattern,
    flags: value.flags ?? '',
    raw: JSON.stringify(value),
    returnMessage: value.return_message,
  };
}

export function normalizeBuiltInValidator(
  value: ContextBuiltInValidatorDefinition | undefined,
): NormalizedContextBuiltInValidator | undefined {
  if (value === undefined || value === false) {
    return undefined;
  }

  if (value === true) {
    return {};
  }

  return {
    returnMessage: value.return_message,
  };
}

function parseRegexLiteral(value: string): { pattern: string; flags: string } | undefined {
  if (!value.startsWith('/')) {
    return undefined;
  }

  for (let index = value.length - 1; index > 0; index -= 1) {
    if (value[index] !== '/') {
      continue;
    }

    let backslashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
      backslashCount += 1;
    }

    if (backslashCount % 2 === 1) {
      continue;
    }

    return {
      pattern: value.slice(1, index),
      flags: value.slice(index + 1),
    };
  }

  return undefined;
}

export function formatInvalidContextRegexMessage(details: {
  promptId: string;
  variable: string;
  field: string;
  raw: string;
  reason: string;
}): string {
  return [
    `Invalid context regex for prompt "${details.promptId}"`,
    `variable "${details.variable}"`,
    `field "${details.field}"`,
    `value ${JSON.stringify(details.raw)}: ${details.reason}`,
  ].join(', ');
}

export function compileContextRegex(
  regex: NormalizedContextRegex,
  details: { promptId: string; variable: string; field: string },
): RegExp {
  if (regex.invalidLiteral) {
    throw new Error(
      `POK013: ${formatInvalidContextRegexMessage({
        ...details,
        raw: regex.raw,
        reason: 'Malformed regex literal. Use /pattern/flags or { pattern, flags }.',
      })}`,
    );
  }

  try {
    return new RegExp(regex.pattern, regex.flags);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`POK013: ${formatInvalidContextRegexMessage({ ...details, raw: regex.raw, reason })}`);
  }
}

function getRejectSecretsRegex(): NormalizedContextRegex {
  return {
    pattern: REJECT_SECRETS_PATTERN,
    flags: REJECT_SECRETS_FLAGS,
    raw: JSON.stringify({ pattern: REJECT_SECRETS_PATTERN, flags: REJECT_SECRETS_FLAGS }),
  };
}

type TrimMode = boolean | 'start' | 'end' | 'both';

function isTrimEnabled(mode: TrimMode | undefined): mode is true | 'start' | 'end' | 'both' {
  return mode === true || mode === 'start' || mode === 'end' || mode === 'both';
}

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
): SanitizedContextVariablesResult {
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

    if (isTrimEnabled(input.trim) && input.max_size !== undefined) {
      candidate = trimToMaxSize(candidate, input.max_size, input.trim);
    }

    sanitized[input.name] = candidate;

    if (input.allow_regex) {
      const candidate = sanitized[input.name];
      const matcher = compileContextRegex(input.allow_regex, {
        promptId: asset.id,
        variable: input.name,
        field: 'allow_regex',
      });
      if (!matcher.test(candidate)) {
        if (input.allow_regex.returnMessage) {
          return {
            variables: sanitized,
            shortCircuit: {
              returnMessage: input.allow_regex.returnMessage,
              code: 'POK031',
              variable: input.name,
              field: 'allow_regex',
            },
          };
        }

        throw new Error(
          `POK031: Context variable "${input.name}" failed allow_regex validation for prompt "${asset.id}".`,
        );
      }
    }

    if (input.deny_regex) {
      const candidate = sanitized[input.name];
      const matcher = compileContextRegex(input.deny_regex, {
        promptId: asset.id,
        variable: input.name,
        field: 'deny_regex',
      });
      if (matcher.test(candidate)) {
        if (input.deny_regex.returnMessage) {
          return {
            variables: sanitized,
            shortCircuit: {
              returnMessage: input.deny_regex.returnMessage,
              code: 'POK032',
              variable: input.name,
              field: 'deny_regex',
            },
          };
        }

        throw new Error(
          `POK032: Context variable "${input.name}" matched deny_regex for prompt "${asset.id}".`,
        );
      }
    }

    if (input.non_empty && candidate.trim().length === 0) {
      if (input.non_empty.returnMessage) {
        return {
          variables: sanitized,
          shortCircuit: {
            returnMessage: input.non_empty.returnMessage,
            code: 'POK033',
            variable: input.name,
            field: 'non_empty',
          },
        };
      }

      throw new Error(
        `POK033: Context variable "${input.name}" failed non_empty validation for prompt "${asset.id}".`,
      );
    }

    if (input.reject_secrets) {
      const matcher = compileContextRegex(getRejectSecretsRegex(), {
        promptId: asset.id,
        variable: input.name,
        field: 'reject_secrets',
      });
      if (matcher.test(candidate)) {
        if (input.reject_secrets.returnMessage) {
          return {
            variables: sanitized,
            shortCircuit: {
              returnMessage: input.reject_secrets.returnMessage,
              code: 'POK034',
              variable: input.name,
              field: 'reject_secrets',
            },
          };
        }

        throw new Error(
          `POK034: Context variable "${input.name}" matched reject_secrets validation for prompt "${asset.id}".`,
        );
      }
    }
  }

  return { variables: sanitized };
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
    if (!areContextInputWarningsEnabled(input)) {
      continue;
    }

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
