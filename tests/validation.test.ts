import { describe, it, expect } from 'vitest';
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
      context: { inputs: ['name'] },
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
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('pull_request');
  });

  it('warns on declared but unused variables', () => {
    const result = validateAsset({
      id: 'test',
      schema_version: 1,
      context: { inputs: ['name', 'unused_var'] },
      sections: { prompt_template: '{{ name }}' },
    });
    const warning = result.warnings.find((w) => w.code === 'POK012');
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('unused_var');
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
