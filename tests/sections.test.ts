import { describe, it, expect } from 'vitest';
import { extractSections } from '../src/parser/sections.js';

describe('extractSections', () => {
  it('extracts system instructions and prompt template', () => {
    const body = `
# System instructions

Be helpful.

# Prompt template

Hello {{ name }}.
`;
    const sections = extractSections(body);
    expect(sections.system_instructions).toBe('Be helpful.');
    expect(sections.prompt_template).toBe('Hello {{ name }}.');
  });

  it('is case-insensitive', () => {
    const body = `
# SYSTEM INSTRUCTIONS

Be helpful.

# PROMPT TEMPLATE

Hello.
`;
    const sections = extractSections(body);
    expect(sections.system_instructions).toBe('Be helpful.');
    expect(sections.prompt_template).toBe('Hello.');
  });

  it('treats H2+ as content, not section boundaries', () => {
    const body = `
# System instructions

Be helpful.

## Additional rules

Follow these too.

# Prompt template

Hello.
`;
    const sections = extractSections(body);
    expect(sections.system_instructions).toContain('## Additional rules');
    expect(sections.system_instructions).toContain('Follow these too.');
  });

  it('returns entire body as prompt_template when no H1 headings', () => {
    const body = `Just do the thing.`;
    const sections = extractSections(body);
    expect(sections.prompt_template).toBe('Just do the thing.');
    expect(sections.system_instructions).toBeUndefined();
  });

  it('extracts notes section', () => {
    const body = `
# Prompt template

Hello.

# Notes

This is internal documentation.
`;
    const sections = extractSections(body);
    expect(sections.prompt_template).toBe('Hello.');
    expect(sections.notes).toBe('This is internal documentation.');
  });

  it('ignores unknown H1 headings', () => {
    const body = `
# System instructions

Be helpful.

# Random heading

Some content.
`;
    const sections = extractSections(body);
    expect(sections.system_instructions).toBe('Be helpful.');
    // Unknown heading content is lost (by design — warn in validation)
  });
});
