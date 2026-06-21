import { estimateHeuristicTokens } from './token-compression.js';

export interface CodeCompactionOptions {
  enabled?: boolean;
  remove_comments?: boolean;
  trim_indentation?: boolean;
  collapse_blank_lines?: boolean;
}

export interface CodeCompactionOutput {
  output: string;
  inputTokens: number;
  outputTokens: number;
  tokensSaved: number;
  compressionRatio: number;
}

export function compactCode(input: string, options: CodeCompactionOptions = {}): CodeCompactionOutput {
  const inputText = input ?? '';
  const removeComments = options.remove_comments ?? true;
  const trimIndentation = options.trim_indentation ?? true;
  const collapseBlankLines = options.collapse_blank_lines ?? true;

  let output = inputText.replace(/\r\n?/g, '\n');

  if (removeComments) {
    output = stripCodeComments(output);
  }

  output = output
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');

  if (trimIndentation) {
    output = stripCommonIndent(output);
  }

  if (collapseBlankLines) {
    output = output
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .join('\n');
  }

  output = output.trim();

  const inputTokens = estimateHeuristicTokens(inputText);
  const outputTokens = estimateHeuristicTokens(output);

  return {
    output,
    inputTokens,
    outputTokens,
    tokensSaved: Math.max(0, inputTokens - outputTokens),
    compressionRatio: outputTokens === 0 ? 0 : inputTokens / outputTokens,
  };
}

function stripCommonIndent(input: string): string {
  const lines = input.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    return '';
  }

  const commonIndent = Math.min(
    ...nonEmptyLines.map((line) => {
      const match = line.match(/^[ \t]*/);
      return match?.[0].length ?? 0;
    }),
  );

  if (commonIndent === 0) {
    return input;
  }

  return lines.map((line) => line.slice(commonIndent)).join('\n');
}

function stripCodeComments(input: string): string {
  let output = '';
  let index = 0;
  let quote: '"' | "'" | '`' | undefined;
  let escaped = false;
  let atLineStart = true;

  while (index < input.length) {
    const char = input[index];
    const next = input[index + 1];

    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      atLineStart = char === '\n';
      index += 1;
      continue;
    }

    if ((char === '"' || char === "'" || char === '`')) {
      quote = char;
      output += char;
      atLineStart = false;
      index += 1;
      continue;
    }

    if (atLineStart && char === '#' && next === '!') {
      while (index < input.length && input[index] !== '\n') {
        output += input[index];
        index += 1;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      index += 2;
      while (index < input.length && input[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) {
        if (input[index] === '\n') {
          output += '\n';
        }
        index += 1;
      }
      index += input[index] === '*' ? 2 : 0;
      continue;
    }

    if (char === '#' && (next === ' ' || next === '\t')) {
      index += 1;
      while (index < input.length && input[index] !== '\n') {
        index += 1;
      }
      continue;
    }

    output += char;
    atLineStart = char === '\n' || (atLineStart && (char === ' ' || char === '\t'));
    index += 1;
  }

  return output;
}
