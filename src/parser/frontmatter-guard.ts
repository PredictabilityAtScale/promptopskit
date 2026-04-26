const FRONT_MATTER_DELIMITER = /^---[ \t]*$/;
const REGEX_FIELD = /^(?<indent>\s*)(?<field>allow_regex|deny_regex)\s*:\s*(?<value>.*)$/;
const PATTERN_FIELD = /^(?<indent>\s*)pattern\s*:\s*(?<value>.*)$/;
const INLINE_PATTERN_FIELD = /(?:^|[{,]\s*)pattern\s*:\s*(?<value>"(?:\\.|[^"\\])*")/;

interface PendingRegexField {
  field: string;
  indent: number;
}

export function assertRegexFrontMatterQuoting(content: string, filePath?: string): void {
  const frontMatter = extractFrontMatter(content);
  if (!frontMatter) {
    return;
  }

  let pendingRegex: PendingRegexField | undefined;

  for (const [index, line] of frontMatter.lines.entries()) {
    const lineNumber = frontMatter.startLine + index;
    const regexMatch = line.match(REGEX_FIELD);

    if (regexMatch?.groups) {
      const field = regexMatch.groups.field;
      const indent = regexMatch.groups.indent.length;
      const value = regexMatch.groups.value.trim();
      pendingRegex = value === '' ? { field, indent } : undefined;

      assertNoUnescapedBackslashInDoubleQuotedRegex(value, field, filePath, lineNumber);
      assertNoUnescapedBackslashInInlinePattern(value, field, filePath, lineNumber);
      continue;
    }

    if (!pendingRegex) {
      continue;
    }

    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= pendingRegex.indent) {
      pendingRegex = undefined;
      continue;
    }

    const patternMatch = line.match(PATTERN_FIELD);
    if (!patternMatch?.groups) {
      continue;
    }

    assertNoUnescapedBackslashInDoubleQuotedRegex(
      patternMatch.groups.value.trim(),
      `${pendingRegex.field}.pattern`,
      filePath,
      lineNumber,
    );
  }
}

function assertNoUnescapedBackslashInInlinePattern(
  value: string,
  field: string,
  filePath: string | undefined,
  lineNumber: number,
): void {
  const match = value.match(INLINE_PATTERN_FIELD);
  const pattern = match?.groups?.value;
  if (!pattern) {
    return;
  }

  assertNoUnescapedBackslashInDoubleQuotedRegex(pattern, `${field}.pattern`, filePath, lineNumber);
}

function extractFrontMatter(content: string): { lines: string[]; startLine: number } | undefined {
  const lines = content.split(/\r?\n/);
  if (!FRONT_MATTER_DELIMITER.test(lines[0] ?? '')) {
    return undefined;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (FRONT_MATTER_DELIMITER.test(lines[index] ?? '')) {
      return {
        lines: lines.slice(1, index),
        startLine: 2,
      };
    }
  }

  return undefined;
}

function assertNoUnescapedBackslashInDoubleQuotedRegex(
  value: string,
  field: string,
  filePath: string | undefined,
  lineNumber: number,
): void {
  if (!value.startsWith('"')) {
    return;
  }

  const quoted = readDoubleQuotedScalar(value);
  if (!quoted) {
    return;
  }

  if (!hasUnescapedBackslash(quoted)) {
    return;
  }

  const location = filePath ? `${filePath}:${lineNumber}` : `line ${lineNumber}`;
  throw new Error(
    `POK013: Invalid context regex YAML at ${location}, field "${field}": `
    + 'double-quoted regex strings treat backslashes as YAML escapes. '
    + 'Use unquoted /pattern/i literal form, single quotes, or double each backslash.',
  );
}

function readDoubleQuotedScalar(value: string): string | undefined {
  let result = '';

  for (let index = 1; index < value.length; index += 1) {
    const char = value[index];

    if (char === '"') {
      return result;
    }

    result += char;

    if (char === '\\' && index + 1 < value.length) {
      index += 1;
      result += value[index];
    }
  }

  return undefined;
}

function hasUnescapedBackslash(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\\') {
      continue;
    }

    let count = 1;
    while (value[index + count] === '\\') {
      count += 1;
    }

    if (count % 2 === 1) {
      return true;
    }

    index += count - 1;
  }

  return false;
}
