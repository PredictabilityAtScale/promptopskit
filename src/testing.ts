import { parsePrompt } from './parser/index.js';
import type { PromptAsset, ResolvedPromptAsset } from './schema/index.js';

/**
 * Create a mock PromptAsset for testing.
 */
export function createMockAsset(overrides: Partial<PromptAsset> = {}): PromptAsset {
  return {
    id: 'test.prompt',
    schema_version: 1,
    provider: 'openai',
    model: 'gpt-5.4',
    sections: {
      system_instructions: 'You are a test assistant.',
      prompt_template: 'Hello {{ name }}',
    },
    ...overrides,
  };
}

/**
 * Create a mock ResolvedPromptAsset for testing.
 */
export function createMockResolvedAsset(
  overrides: Partial<ResolvedPromptAsset> = {},
): ResolvedPromptAsset {
  return {
    id: 'test.prompt',
    schema_version: 1,
    provider: 'openai',
    model: 'gpt-5.4',
    sections: {
      system_instructions: 'You are a test assistant.',
      prompt_template: 'Hello {{ name }}',
    },
    source: {
      file_path: 'test.md',
    },
    ...overrides,
  } as ResolvedPromptAsset;
}

/**
 * Parse an inline prompt string for testing.
 */
export function parseTestPrompt(source: string): PromptAsset {
  const { asset } = parsePrompt(source);
  return asset;
}
