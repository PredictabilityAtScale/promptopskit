import { describe, it, expect } from 'vitest';
import { interpolate, extractVariables } from '../src/renderer/interpolate.js';

describe('interpolate', () => {
  it('replaces variables', () => {
    const result = interpolate('Hello {{ name }}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('handles multiple variables', () => {
    const result = interpolate('{{ greeting }} {{ name }}!', { greeting: 'Hi', name: 'Alice' });
    expect(result).toBe('Hi Alice!');
  });

  it('handles whitespace variations in braces', () => {
    const result = interpolate('{{name}} and {{  name  }}', { name: 'Bob' });
    expect(result).toBe('Bob and Bob');
  });

  it('supports runtime context placeholders by key name', () => {
    const result = interpolate('Context: {{ app_context }}', { app_context: 'Billing screen' });
    expect(result).toBe('Context: Billing screen');
  });

  it('leaves missing variables as-is in permissive mode', () => {
    const result = interpolate('Hello {{ name }}!', {});
    expect(result).toBe('Hello {{ name }}!');
  });

  it('throws on missing variables in strict mode', () => {
    expect(() => interpolate('Hello {{ name }}!', {}, { strict: true }))
      .toThrow('Missing required variable: "name"');
  });

  it('handles escaped braces', () => {
    const result = interpolate('Use \\{\\{ to escape', { });
    expect(result).toBe('Use {{ to escape');
  });

  it('does not replace inside escaped sequences', () => {
    const result = interpolate('\\{\\{ name }} is literal', { name: 'Bob' });
    expect(result).toBe('{{ name }} is literal');
  });
});

describe('extractVariables', () => {
  it('extracts variable names', () => {
    const vars = extractVariables('Hello {{ name }}, your id is {{ user_id }}.');
    expect(vars).toEqual(['name', 'user_id']);
  });

  it('extracts runtime context variables by key name', () => {
    const vars = extractVariables('Use {{ app_context }} for {{ user_goal }}.');
    expect(vars).toEqual(['app_context', 'user_goal']);
  });

  it('deduplicates', () => {
    const vars = extractVariables('{{ x }} and {{ x }}');
    expect(vars).toEqual(['x']);
  });

  it('returns empty array when no variables', () => {
    const vars = extractVariables('No variables here.');
    expect(vars).toEqual([]);
  });
});
