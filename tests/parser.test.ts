import { describe, it, expect } from 'vitest';
import { parsePrompt } from '../src/parser/index.js';

describe('parsePrompt', () => {
  it('parses a basic prompt with front matter and sections', () => {
    const source = `---
id: test.basic
schema_version: 1
provider: openai
model: gpt-5.4
---

# System instructions

You are a helpful assistant.

# Prompt template

Hello {{ name }}.
`;
    const { asset, raw } = parsePrompt(source);

    expect(asset.id).toBe('test.basic');
    expect(asset.schema_version).toBe(1);
    expect(asset.provider).toBe('openai');
    expect(asset.model).toBe('gpt-5.4');
    expect(asset.sections?.system_instructions).toBe('You are a helpful assistant.');
    expect(asset.sections?.prompt_template).toBe('Hello {{ name }}.');
    expect(raw.body).toContain('# System instructions');
  });

  it('treats body without headings as prompt_template', () => {
    const source = `---
id: test.noheadings
schema_version: 1
---

Just a simple prompt with no headings.
`;
    const { asset } = parsePrompt(source);
    expect(asset.sections?.prompt_template).toBe('Just a simple prompt with no headings.');
    expect(asset.sections?.system_instructions).toBeUndefined();
  });

  it('parses inline source string', () => {
    const { asset } = parsePrompt(`---
id: inline
schema_version: 1
provider: openai
model: gpt-5.4
---

# Prompt template

Say hi`);
    expect(asset.id).toBe('inline');
    expect(asset.sections?.prompt_template).toBe('Say hi');
  });

  it('records file path in source', () => {
    const { asset } = parsePrompt(`---
id: sourced
schema_version: 1
---

# Prompt template

test`, 'prompts/test.md');
    expect(asset.source?.file_path).toBe('prompts/test.md');
  });
});
