import { readFile } from 'node:fs/promises';

import matter from 'gray-matter';

import { parsePrompt } from './parser/index.js';
import type { PromptAsset, ResolvedPromptAsset } from './schema/index.js';

export interface PromptTestCase<TResponse = unknown> {
  name: string;
  variables?: Record<string, string>;
  response?: TResponse;
  expected_response?: TResponse;
}

export interface PromptTestSidecar<TResponse = unknown> {
  cases: Array<PromptTestCase<TResponse>>;
}

export interface PromptTestRenderer {
  renderPrompt(options: {
    path?: string;
    source?: string;
    provider: string;
    environment?: string;
    tier?: string;
    variables?: Record<string, string>;
    strict?: boolean;
  }): Promise<unknown>;
}

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

/**
 * Parse a .test.yaml sidecar file.
 */
export function parsePromptTestSidecar<TResponse = unknown>(source: string): PromptTestSidecar<TResponse> {
  const parsed = matter(`---\n${source.trim()}\n---\n`);
  const data = parsed.data as Partial<PromptTestSidecar<TResponse>>;

  if (!Array.isArray(data.cases)) {
    throw new Error('Prompt test sidecar must include a "cases" array.');
  }

  return {
    cases: data.cases.map((testCase, index) => {
      if (!testCase || typeof testCase !== 'object') {
        throw new Error(`Prompt test case at index ${index} must be an object.`);
      }

      if (typeof testCase.name !== 'string' || testCase.name.length === 0) {
        throw new Error(`Prompt test case at index ${index} must include a non-empty "name".`);
      }

      return testCase;
    }),
  };
}

/**
 * Load a .test.yaml sidecar file from disk.
 */
export async function loadPromptTestSidecar<TResponse = unknown>(
  filePath: string | URL,
): Promise<PromptTestSidecar<TResponse>> {
  return parsePromptTestSidecar<TResponse>(await readFile(filePath, 'utf-8'));
}

/**
 * Find a named test case in a sidecar.
 */
export function getPromptTestCase<TResponse = unknown>(
  sidecar: PromptTestSidecar<TResponse> | Array<PromptTestCase<TResponse>>,
  name: string,
): PromptTestCase<TResponse> {
  const cases = Array.isArray(sidecar) ? sidecar : sidecar.cases;
  const testCase = cases.find((candidate) => candidate.name === name);

  if (!testCase) {
    throw new Error(`Prompt test case "${name}" was not found.`);
  }

  return testCase;
}

/**
 * Read the canned response for a named case.
 */
export function getHardcodedPromptResponse<TResponse = unknown>(
  sidecar: PromptTestSidecar<TResponse> | Array<PromptTestCase<TResponse>>,
  name: string,
): TResponse {
  const testCase = getPromptTestCase(sidecar, name);
  const response = testCase.response ?? testCase.expected_response;

  if (response === undefined) {
    throw new Error(`Prompt test case "${name}" does not define a "response".`);
  }

  return response;
}

/**
 * Create a small responder for unit tests and local development flows.
 */
export function createHardcodedPromptResponder<TResponse = unknown>(
  sidecar: PromptTestSidecar<TResponse> | Array<PromptTestCase<TResponse>>,
): (name: string) => TResponse {
  return (name) => getHardcodedPromptResponse(sidecar, name);
}

/**
 * Render a prompt using variables from a named sidecar case.
 */
export async function renderPromptTestCase<TResponse = unknown>(
  kit: PromptTestRenderer,
  options: {
    sidecar: PromptTestSidecar<TResponse> | Array<PromptTestCase<TResponse>>;
    caseName: string;
    path?: string;
    source?: string;
    provider: string;
    environment?: string;
    tier?: string;
    strict?: boolean;
  },
): Promise<{
  testCase: PromptTestCase<TResponse>;
  rendered: unknown;
  response?: TResponse;
}> {
  const testCase = getPromptTestCase(options.sidecar, options.caseName);
  const rendered = await kit.renderPrompt({
    path: options.path,
    source: options.source,
    provider: options.provider,
    environment: options.environment,
    tier: options.tier,
    variables: testCase.variables,
    strict: options.strict,
  });

  return {
    testCase,
    rendered,
    response: testCase.response ?? testCase.expected_response,
  };
}
