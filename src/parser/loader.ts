import { readFile } from 'node:fs/promises';
import { parsePrompt } from './parser.js';
import type { ParseResult } from './parser.js';

/**
 * Load and parse a prompt file from disk.
 */
export async function loadPromptFile(filePath: string): Promise<ParseResult> {
  const content = await readFile(filePath, 'utf-8');
  return parsePrompt(content, filePath);
}
