import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPromptOpsKit } from '../src/index.js';
import { validateAsset } from '../src/validation/validate.js';
import { levenshtein } from '../src/validation/levenshtein.js';

describe('validateAsset', () => {
  it('passes for a valid asset', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      sections: { prompt_template: 'Hello' },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on missing id', () => {
    const result = validateAsset({
      id: '',
      schema_version: 1,
      sections: { prompt_template: 'Hello' },
    });
    // Zod min length would catch this, but our custom check also flags it
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('fails on missing body sections', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      sections: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'POK003')).toBe(true);
  });

  it('warns on unknown front matter keys with suggestion', () => {
    const result = validateAsset(
      { id: 'test', schema_version: 1, sections: { prompt_template: 'Hi' } },
      ['id', 'schema_version', 'metadta'], // typo of 'metadata'
    );
    const warning = result.warnings.find((w) => w.code === 'POK010');
    expect(warning).toBeDefined();
    expect(warning?.suggestion).toContain('metadata');
  });

  it('warns on used but undeclared variables', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: { inputs: [{ name: 'name', max_size: 100 }] },
      sections: { prompt_template: '{{ name }} {{ age }}' },
    });
    const warning = result.warnings.find((w) => w.code === 'POK011');
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('age');
  });

  it('warns on variables used with no context.inputs declared', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      sections: { prompt_template: '{{ pull_request }}' },
    });
    const warning = result.warnings.find((w) => w.code === 'POK011');
    const policyWarning = result.warnings.find((w) => w.code === 'POK046');
    expect(warning).toBeDefined();
    expect(policyWarning).toBeDefined();
    expect(warning?.message).toContain('pull_request');
  });

  it('warns on declared but unused variables', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: { inputs: ['name', { name: 'unused_var', max_size: 50 }] },
      sections: { prompt_template: '{{ name }}' },
    });
    const warning = result.warnings.find((w) => w.code === 'POK012');
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('unused_var');
  });

  it('accepts object-form context input definitions', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: {
        inputs: [{ name: 'account_summary', max_size: 2048, non_empty: true, reject_secrets: true }],
      },
      sections: { prompt_template: '{{ account_summary }}' },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when a context allow_regex is invalid', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: {
        inputs: [{ name: 'user_id', allow_regex: { pattern: '[a-z', flags: 'i' } }],
      },
      sections: { prompt_template: '{{ user_id }}' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'POK013')).toBe(true);
    expect(result.errors[0]?.message).toContain('prompt "test"');
    expect(result.errors[0]?.message).toContain('variable "user_id"');
    expect(result.errors[0]?.message).toContain('field "allow_regex"');
  });

  it('fails when a context deny_regex is invalid', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: {
        inputs: [{ name: 'user_message', deny_regex: '/secret/z' }],
      },
      sections: { prompt_template: '{{ user_message }}' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'POK013')).toBe(true);
    expect(result.errors[0]?.message).toContain('value "/secret/z"');
  });

  it('fails when a regex literal string is malformed', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: {
        inputs: [{ name: 'user_message', deny_regex: '/secret' }],
      },
      sections: { prompt_template: '{{ user_message }}' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'POK013')).toBe(true);
    expect(result.errors[0]?.message).toContain('value "/secret"');
    expect(result.errors[0]?.message).toContain('Malformed regex literal');
  });

  it('accepts regex objects with flags and regex literal strings', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: {
        inputs: [
          { name: 'user_id', allow_regex: { pattern: '^user_[a-z0-9]+$', flags: 'i' } },
          { name: 'user_message', deny_regex: '/ignore previous instructions/i' },
        ],
      },
      sections: { prompt_template: '{{ user_id }} {{ user_message }}' },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('warns when trim is set without max_size', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: {
        inputs: [{ name: 'user_id', trim: true }],
      },
      sections: { prompt_template: '{{ user_id }}' },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'POK014')).toBe(true);
  });

  it('warns on risky unbounded context inputs and missing hardening', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: {
        inputs: [{ name: 'user_message' }],
      },
      sections: { prompt_template: '{{ user_message }}' },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'POK040')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'POK041')).toBe(true);
  });

  it('warns when provider cache/model guidance is missing', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      provider: 'openai',
      sections: { prompt_template: 'Hello' },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'POK042')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'POK044')).toBe(true);
  });

  it('warns on conflicting gemini/google cache entries', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      cache: {
        gemini: { cached_content: 'cachedContents/abc' },
        google: { cached_content: 'cachedContents/xyz' },
      },
      sections: { prompt_template: 'Hello' },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'POK043')).toBe(true);
  });

  it('warns on inline tools missing schema metadata', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      tools: [{ name: 'lookup_customer' }],
      sections: { prompt_template: 'Hello' },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.filter((warning) => warning.code === 'POK047')).toHaveLength(2);
  });

  it('does not warn when trim is explicitly false without max_size', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: {
        inputs: [{ name: 'user_id', trim: false }],
      },
      sections: { prompt_template: '{{ user_id }}' },
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'POK014')).toBe(false);
  });

});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('computes distance correctly', () => {
    expect(levenshtein('temperture', 'temperature')).toBeLessThanOrEqual(2);
    expect(levenshtein('mdoel', 'model')).toBeLessThanOrEqual(2);
  });
});

describe('PromptOpsKit.validatePrompt', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-validate-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reports missing include files through the kit API', async () => {
    await mkdir(join(tmpDir, 'prompts'), { recursive: true });
    await writeFile(join(tmpDir, 'prompts', 'main.md'), `---
id: main
schema_version: 1
includes:
  - ./missing.md
---

# Prompt template

Hello.
`);

    const kit = createPromptOpsKit({ sourceDir: join(tmpDir, 'prompts') });
    const result = await kit.validatePrompt('main');

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'POK020')).toBe(true);
  });

  it('reports invalid context regex definitions through the kit API', async () => {
    await mkdir(join(tmpDir, 'prompts'), { recursive: true });
    await writeFile(join(tmpDir, 'prompts', 'invalid-regex.md'), `---
id: invalid.regex
schema_version: 1
context:
  inputs:
    - name: pull_request_body
      deny_regex: "/secret/z"
---

# Prompt template

{{ pull_request_body }}
`);

    const kit = createPromptOpsKit({ sourceDir: join(tmpDir, 'prompts') });
    const result = await kit.validatePrompt('invalid-regex');

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'POK013')).toBe(true);
    expect(result.errors[0]?.message).toContain('prompt "invalid.regex"');
    expect(result.errors[0]?.message).toContain('field "deny_regex"');
  });

  it('reports circular includes through the kit API', async () => {
    await mkdir(join(tmpDir, 'prompts'), { recursive: true });
    await writeFile(join(tmpDir, 'prompts', 'a.md'), `---
id: a
schema_version: 1
includes:
  - ./b.md
---

# Prompt template

A
`);
    await writeFile(join(tmpDir, 'prompts', 'b.md'), `---
id: b
schema_version: 1
includes:
  - ./a.md
---

# Prompt template

B
`);

    const kit = createPromptOpsKit({ sourceDir: join(tmpDir, 'prompts') });
    const result = await kit.validatePrompt('a');

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'POK021')).toBe(true);
  });
});
