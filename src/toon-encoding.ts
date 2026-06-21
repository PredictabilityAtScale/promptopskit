type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ToonEncodeOptions {
  indent?: number;
  delimiter?: ',' | '\t' | '|';
}

export interface JsonToToonResult {
  output: string;
  value: JsonValue;
}

const DEFAULT_INDENT = 2;
const DEFAULT_DELIMITER = ',';

export function tryJsonToToon(text: string, options: ToonEncodeOptions = {}): JsonToToonResult | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }

  const value = normalizeJsonValue(parsed);
  if (value === undefined) {
    return undefined;
  }

  return {
    output: encodeToon(value, options),
    value,
  };
}

export function encodeToon(value: JsonValue, options: ToonEncodeOptions = {}): string {
  const resolved = {
    indent: options.indent ?? DEFAULT_INDENT,
    delimiter: options.delimiter ?? DEFAULT_DELIMITER,
  };

  return encodeValue(value, undefined, 0, resolved).join('\n');
}

function normalizeJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item) ?? null);
  }

  if (isPlainObject(value)) {
    const normalized: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      normalized[key] = normalizeJsonValue(child) ?? null;
    }
    return normalized;
  }

  return undefined;
}

function encodeValue(
  value: JsonValue,
  key: string | undefined,
  depth: number,
  options: Required<ToonEncodeOptions>,
): string[] {
  if (isPrimitive(value)) {
    return [line(depth, key === undefined ? encodePrimitive(value, options.delimiter) : `${encodeKey(key)}: ${encodePrimitive(value, options.delimiter)}`, options.indent)];
  }

  if (Array.isArray(value)) {
    return encodeArray(value, key, depth, options);
  }

  return encodeObject(value, key, depth, options);
}

function encodeObject(
  value: { [key: string]: JsonValue },
  key: string | undefined,
  depth: number,
  options: Required<ToonEncodeOptions>,
): string[] {
  const entries = Object.entries(value);
  const lines: string[] = [];

  if (key !== undefined) {
    lines.push(line(depth, `${encodeKey(key)}:`, options.indent));
  }

  const childDepth = key === undefined ? depth : depth + 1;
  for (const [childKey, childValue] of entries) {
    lines.push(...encodeValue(childValue, childKey, childDepth, options));
  }

  return lines;
}

function encodeArray(
  value: JsonValue[],
  key: string | undefined,
  depth: number,
  options: Required<ToonEncodeOptions>,
): string[] {
  const prefix = key === undefined ? '' : encodeKey(key);

  if (value.length === 0) {
    return [line(depth, key === undefined ? '[]' : `${prefix}: []`, options.indent)];
  }

  if (value.every(isPrimitive)) {
    const joined = value.map((item) => encodePrimitive(item, options.delimiter)).join(options.delimiter);
    return [line(depth, `${prefix}[${value.length}]: ${joined}`, options.indent)];
  }

  const tabularFields = getTabularFields(value);
  if (tabularFields) {
    const lines = [
      line(depth, `${prefix}[${value.length}]{${tabularFields.map(encodeKey).join(options.delimiter)}}:`, options.indent),
    ];
    for (const row of value as Array<{ [key: string]: JsonPrimitive }>) {
      lines.push(line(depth + 1, tabularFields.map((field) => encodePrimitive(row[field], options.delimiter)).join(options.delimiter), options.indent));
    }
    return lines;
  }

  const lines = [line(depth, `${prefix}[${value.length}]:`, options.indent)];
  for (const item of value) {
    lines.push(...encodeListItem(item, depth + 1, options));
  }
  return lines;
}

function encodeListItem(
  value: JsonValue,
  depth: number,
  options: Required<ToonEncodeOptions>,
): string[] {
  if (isPrimitive(value)) {
    return [line(depth, `- ${encodePrimitive(value, options.delimiter)}`, options.indent)];
  }

  if (Array.isArray(value)) {
    const encoded = encodeArray(value, undefined, depth, options);
    return encoded.map((item, index) => {
      if (index === 0) {
        return line(depth, `- ${item.trimStart()}`, options.indent);
      }
      return item;
    });
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return [line(depth, '-', options.indent)];
  }

  const [firstKey, firstValue] = entries[0];
  const rest = Object.fromEntries(entries.slice(1)) as { [key: string]: JsonValue };
  const firstLines = encodeValue(firstValue, firstKey, depth, options);
  const lines = [line(depth, `- ${firstLines[0].trimStart()}`, options.indent)];

  for (const continuation of firstLines.slice(1)) {
    lines.push(continuation);
  }

  if (Object.keys(rest).length > 0) {
    lines.push(...encodeObject(rest, undefined, depth + 1, options));
  }

  return lines;
}

function getTabularFields(value: JsonValue[]): string[] | undefined {
  if (value.length === 0 || !value.every(isObjectRecord)) {
    return undefined;
  }

  const first = value[0] as { [key: string]: JsonValue };
  const fields = Object.keys(first);
  if (fields.length === 0) {
    return undefined;
  }

  for (const row of value as Array<{ [key: string]: JsonValue }>) {
    const keys = Object.keys(row);
    if (keys.length !== fields.length) {
      return undefined;
    }
    for (const field of fields) {
      if (!(field in row) || !isPrimitive(row[field])) {
        return undefined;
      }
    }
  }

  return fields;
}

function encodePrimitive(value: JsonPrimitive, delimiter: string): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return encodeString(value, delimiter);
}

function encodeString(value: string, delimiter: string): string {
  if (isSafeUnquotedString(value, delimiter)) {
    return value;
  }
  return JSON.stringify(value);
}

function encodeKey(key: string): string {
  if (/^[A-Z_][\w.]*$/i.test(key)) {
    return key;
  }
  return JSON.stringify(key);
}

function isSafeUnquotedString(value: string, delimiter: string): boolean {
  if (value.length === 0 || value !== value.trim()) {
    return false;
  }
  if (/^(?:true|false|null)$/i.test(value) || /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) || /^0\d+$/.test(value)) {
    return false;
  }
  if (value.includes(':') || value.includes('"') || value.includes('\\') || value.includes(delimiter)) {
    return false;
  }
  if (/[[\]{}]|[\u0000-\u001F]/.test(value) || value.startsWith('-')) {
    return false;
  }
  return true;
}

function isPrimitive(value: JsonValue): value is JsonPrimitive {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isObjectRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function line(depth: number, content: string, indent: number): string {
  return `${' '.repeat(depth * indent)}${content}`;
}
