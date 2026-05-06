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

describe('interpolate conditionals — {{#if}}', () => {
  it('renders truthy branch when variable is present and non-empty', () => {
    const result = interpolate(
      'Start\n{{#if premium}}\nPremium content here.\n{{/if}}\nEnd',
      { premium: 'yes' },
    );
    expect(result).toBe('Start\nPremium content here.\nEnd');
  });

  it('removes block when variable is missing (falsy)', () => {
    const result = interpolate(
      'Start\n{{#if premium}}\nPremium content here.\n{{/if}}\nEnd',
      {},
    );
    expect(result).toBe('Start\n\nEnd');
  });

  it('removes block when variable is empty string (falsy)', () => {
    const result = interpolate(
      'Start\n{{#if premium}}\nPremium content here.\n{{/if}}\nEnd',
      { premium: '' },
    );
    expect(result).toBe('Start\n\nEnd');
  });

  it('renders else branch when variable is falsy', () => {
    const result = interpolate(
      '{{#if premium}}\nYou have premium.\n{{else}}\nUpgrade to premium.\n{{/if}}',
      {},
    );
    expect(result).toBe('Upgrade to premium.');
  });

  it('renders if branch (not else) when variable is truthy', () => {
    const result = interpolate(
      '{{#if premium}}\nYou have premium.\n{{else}}\nUpgrade to premium.\n{{/if}}',
      { premium: 'true' },
    );
    expect(result).toBe('You have premium.');
  });

  it('supports variable substitution inside conditional branches', () => {
    const result = interpolate(
      '{{#if plan}}\nPlan: {{ plan }}\n{{else}}\nNo plan selected.\n{{/if}}',
      { plan: 'Enterprise' },
    );
    expect(result).toBe('Plan: Enterprise');
  });

  it('supports variable substitution inside else branches', () => {
    const result = interpolate(
      '{{#if premium}}\nWelcome back!\n{{else}}\nHello {{ name }}, upgrade today.\n{{/if}}',
      { name: 'Alice' },
    );
    expect(result).toBe('Hello Alice, upgrade today.');
  });

  it('does not throw in strict mode for conditional variable check', () => {
    // Conditionals are inherently permissive — a missing var just means falsy
    const result = interpolate(
      '{{#if premium}}\nPremium.\n{{else}}\nFree.\n{{/if}}',
      {},
      { strict: true },
    );
    expect(result).toBe('Free.');
  });

  it('still throws in strict mode for missing substitution variables', () => {
    expect(() => interpolate(
      '{{#if premium}}\n{{ premium }}\n{{/if}}',
      {},
      { strict: true },
    )).not.toThrow(); // block is removed, so {{ premium }} is never reached
  });

  it('throws in strict mode for missing variable in the winning branch', () => {
    expect(() => interpolate(
      '{{#if active}}\nHello {{ name }}!\n{{/if}}',
      { active: 'yes' },
      { strict: true },
    )).toThrow('Missing required variable: "name"');
  });
});

describe('interpolate conditionals — nested blocks', () => {
  it('handles nested if blocks', () => {
    const template = [
      '{{#if a}}',
      'A is true.',
      '{{#if b}}',
      'B is also true.',
      '{{/if}}',
      '{{/if}}',
    ].join('\n');

    const result = interpolate(template, { a: 'yes', b: 'yes' });
    expect(result).toBe('A is true.\nB is also true.');
  });

  it('handles nested if where inner is falsy', () => {
    const template = [
      '{{#if a}}',
      'A is true.',
      '{{#if b}}',
      'B is also true.',
      '{{/if}}',
      '{{/if}}',
    ].join('\n');

    const result = interpolate(template, { a: 'yes' });
    expect(result).toBe('A is true.\n');
  });

  it('handles nested if where outer is falsy', () => {
    const template = [
      '{{#if a}}',
      'A is true.',
      '{{#if b}}',
      'B is also true.',
      '{{/if}}',
      '{{/if}}',
    ].join('\n');

    const result = interpolate(template, { b: 'yes' });
    expect(result).toBe('');
  });

  it('handles nested blocks with else', () => {
    const template = [
      '{{#if a}}',
      '{{#if b}}',
      'Both A and B.',
      '{{else}}',
      'Only A.',
      '{{/if}}',
      '{{else}}',
      'Not A.',
      '{{/if}}',
    ].join('\n');

    expect(interpolate(template, { a: 'yes', b: 'yes' })).toBe('Both A and B.');
    expect(interpolate(template, { a: 'yes' })).toBe('Only A.');
    expect(interpolate(template, {})).toBe('Not A.');
  });
});

describe('interpolate conditionals — {{#unless}}', () => {
  it('renders content when variable is missing', () => {
    const result = interpolate(
      '{{#unless premium}}\nPlease upgrade.\n{{/unless}}',
      {},
    );
    expect(result).toBe('Please upgrade.');
  });

  it('hides content when variable is present', () => {
    const result = interpolate(
      '{{#unless premium}}\nPlease upgrade.\n{{/unless}}',
      { premium: 'yes' },
    );
    expect(result).toBe('');
  });

  it('renders else branch when variable is present', () => {
    const result = interpolate(
      '{{#unless premium}}\nUpgrade.\n{{else}}\nWelcome!\n{{/unless}}',
      { premium: 'yes' },
    );
    expect(result).toBe('Welcome!');
  });

  it('treats empty string as falsy', () => {
    const result = interpolate(
      '{{#unless premium}}\nUpgrade.\n{{/unless}}',
      { premium: '' },
    );
    expect(result).toBe('Upgrade.');
  });
});

describe('interpolate conditionals — inline usage', () => {
  it('handles inline conditional (not on standalone lines)', () => {
    const result = interpolate(
      'Hello {{#if name}}{{ name }}{{else}}stranger{{/if}}!',
      { name: 'Alice' },
    );
    expect(result).toBe('Hello Alice!');
  });

  it('handles inline conditional falsy', () => {
    const result = interpolate(
      'Hello {{#if name}}{{ name }}{{else}}stranger{{/if}}!',
      {},
    );
    expect(result).toBe('Hello stranger!');
  });
});

describe('interpolate conditionals — edge cases', () => {
  it('leaves unclosed blocks as-is', () => {
    const result = interpolate(
      'Start {{#if x}} content without close',
      { x: 'yes' },
    );
    expect(result).toBe('Start {{#if x}} content without close');
  });

  it('handles multiple sequential blocks', () => {
    const template = [
      '{{#if a}}',
      'A.',
      '{{/if}}',
      '{{#if b}}',
      'B.',
      '{{/if}}',
    ].join('\n');

    expect(interpolate(template, { a: 'yes', b: 'yes' })).toBe('A.\nB.');
    expect(interpolate(template, { a: 'yes' })).toBe('A.\n');
    expect(interpolate(template, { b: 'yes' })).toBe('\nB.');
    expect(interpolate(template, {})).toBe('\n');
  });

  it('handles mixed if and unless blocks', () => {
    const template = [
      '{{#if premium}}',
      'Premium user.',
      '{{/if}}',
      '{{#unless premium}}',
      'Free user.',
      '{{/unless}}',
    ].join('\n');

    expect(interpolate(template, { premium: 'yes' })).toBe('Premium user.\n');
    expect(interpolate(template, {})).toBe('\nFree user.');
  });

  it('works with template containing no conditionals', () => {
    const result = interpolate('Hello {{ name }}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('escaped opening braces are not treated as conditionals', () => {
    const result = interpolate('\\{\\{#if foo}} not a block', { foo: 'bar' });
    expect(result).toBe('{{#if foo}} not a block');
  });
});

describe('interpolate conditionals — string comparison (==, !=)', () => {
  it('renders block when variable equals compared value', () => {
    const result = interpolate(
      '{{#if plan == "premium"}}\nPremium features enabled.\n{{/if}}',
      { plan: 'premium' },
    );
    expect(result).toBe('Premium features enabled.');
  });

  it('hides block when variable does not equal compared value', () => {
    const result = interpolate(
      '{{#if plan == "premium"}}\nPremium features enabled.\n{{/if}}',
      { plan: 'basic' },
    );
    expect(result).toBe('');
  });

  it('hides block when variable is missing for == check', () => {
    const result = interpolate(
      '{{#if plan == "premium"}}\nPremium features enabled.\n{{/if}}',
      {},
    );
    expect(result).toBe('');
  });

  it('renders else branch when == comparison is false', () => {
    const result = interpolate(
      '{{#if plan == "premium"}}\nPremium.\n{{else}}\nNot premium.\n{{/if}}',
      { plan: 'basic' },
    );
    expect(result).toBe('Not premium.');
  });

  it('supports != (not equal) operator', () => {
    const result = interpolate(
      '{{#if status != "active"}}\nInactive account.\n{{/if}}',
      { status: 'suspended' },
    );
    expect(result).toBe('Inactive account.');
  });

  it('hides block when != comparison is false (values are equal)', () => {
    const result = interpolate(
      '{{#if status != "active"}}\nInactive account.\n{{/if}}',
      { status: 'active' },
    );
    expect(result).toBe('');
  });

  it('!= treats missing variable as not-equal (block renders)', () => {
    const result = interpolate(
      '{{#if status != "active"}}\nNo status set.\n{{/if}}',
      {},
    );
    expect(result).toBe('No status set.');
  });

  it('supports single-quoted comparison values', () => {
    const result = interpolate(
      "{{#if plan == 'premium'}}\nPremium.\n{{/if}}",
      { plan: 'premium' },
    );
    expect(result).toBe('Premium.');
  });

  it('supports comparison with empty string', () => {
    // == "" should match when variable is explicitly empty
    const result = interpolate(
      '{{#if name == ""}}\nNo name provided.\n{{/if}}',
      { name: '' },
    );
    expect(result).toBe('No name provided.');
  });

  it('handles comparison inline', () => {
    const result = interpolate(
      'Status: {{#if role == "admin"}}Administrator{{else}}User{{/if}}.',
      { role: 'admin' },
    );
    expect(result).toBe('Status: Administrator.');
  });
});

describe('interpolate conditionals — {{else if}} chaining', () => {
  it('evaluates else-if branch when first condition is false', () => {
    const template = [
      '{{#if plan == "enterprise"}}',
      'Enterprise plan.',
      '{{else if plan == "premium"}}',
      'Premium plan.',
      '{{else}}',
      'Free plan.',
      '{{/if}}',
    ].join('\n');

    expect(interpolate(template, { plan: 'premium' })).toBe('Premium plan.');
  });

  it('evaluates first matching branch in chain', () => {
    const template = [
      '{{#if plan == "enterprise"}}',
      'Enterprise.',
      '{{else if plan == "premium"}}',
      'Premium.',
      '{{else if plan == "basic"}}',
      'Basic.',
      '{{else}}',
      'Free.',
      '{{/if}}',
    ].join('\n');

    expect(interpolate(template, { plan: 'enterprise' })).toBe('Enterprise.');
    expect(interpolate(template, { plan: 'premium' })).toBe('Premium.');
    expect(interpolate(template, { plan: 'basic' })).toBe('Basic.');
    expect(interpolate(template, { plan: 'free' })).toBe('Free.');
    expect(interpolate(template, {})).toBe('Free.');
  });

  it('supports else-if with truthiness checks (no ==)', () => {
    const template = [
      '{{#if premium}}',
      'Premium.',
      '{{else if trial}}',
      'Trial.',
      '{{else}}',
      'Free.',
      '{{/if}}',
    ].join('\n');

    expect(interpolate(template, { premium: 'yes' })).toBe('Premium.');
    expect(interpolate(template, { trial: 'yes' })).toBe('Trial.');
    expect(interpolate(template, {})).toBe('Free.');
  });

  it('supports else-if without final else', () => {
    const template = [
      '{{#if plan == "a"}}',
      'A.',
      '{{else if plan == "b"}}',
      'B.',
      '{{/if}}',
    ].join('\n');

    expect(interpolate(template, { plan: 'a' })).toBe('A.');
    expect(interpolate(template, { plan: 'b' })).toBe('B.');
    expect(interpolate(template, { plan: 'c' })).toBe('');
  });

  it('supports mixing == and truthiness in else-if chain', () => {
    const template = [
      '{{#if role == "admin"}}',
      'Admin panel.',
      '{{else if authenticated}}',
      'User dashboard.',
      '{{else}}',
      'Login page.',
      '{{/if}}',
    ].join('\n');

    expect(interpolate(template, { role: 'admin', authenticated: 'yes' })).toBe('Admin panel.');
    expect(interpolate(template, { role: 'user', authenticated: 'yes' })).toBe('User dashboard.');
    expect(interpolate(template, { role: 'user' })).toBe('Login page.');
    expect(interpolate(template, {})).toBe('Login page.');
  });

  it('works with variable substitution inside chained branches', () => {
    const template = [
      '{{#if tier == "enterprise"}}',
      'Welcome, {{ company }}!',
      '{{else if tier == "pro"}}',
      'Pro user: {{ name }}.',
      '{{else}}',
      'Hello {{ name }}, upgrade today.',
      '{{/if}}',
    ].join('\n');

    expect(interpolate(template, { tier: 'enterprise', company: 'Acme', name: 'Bob' }))
      .toBe('Welcome, Acme!');
    expect(interpolate(template, { tier: 'pro', name: 'Alice' }))
      .toBe('Pro user: Alice.');
    expect(interpolate(template, { name: 'Charlie' }))
      .toBe('Hello Charlie, upgrade today.');
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

  it('extracts condition variables from {{#if var}}', () => {
    const vars = extractVariables('{{#if premium}}Content{{/if}}');
    expect(vars).toContain('premium');
  });

  it('extracts condition variables from {{#unless var}}', () => {
    const vars = extractVariables('{{#unless trial}}Content{{/unless}}');
    expect(vars).toContain('trial');
  });

  it('extracts both condition and substitution variables', () => {
    const vars = extractVariables(
      '{{#if premium}}Hello {{ name }}{{/if}}',
    );
    expect(vars).toContain('premium');
    expect(vars).toContain('name');
  });

  it('deduplicates condition and substitution references to same variable', () => {
    const vars = extractVariables(
      '{{#if plan}}Plan: {{ plan }}{{/if}}',
    );
    expect(vars).toEqual(['plan']);
  });

  it('extracts variable from == comparison condition', () => {
    const vars = extractVariables('{{#if plan == "premium"}}Content{{/if}}');
    expect(vars).toContain('plan');
  });

  it('extracts variable from != comparison condition', () => {
    const vars = extractVariables('{{#if status != "active"}}Content{{/if}}');
    expect(vars).toContain('status');
  });

  it('extracts variables from {{else if}} conditions', () => {
    const vars = extractVariables(
      '{{#if a}}A{{else if b == "x"}}B{{else if c}}C{{/if}}',
    );
    expect(vars).toContain('a');
    expect(vars).toContain('b');
    expect(vars).toContain('c');
  });
});
