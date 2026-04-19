import { describe, it, expect } from 'vitest';
import { openaiAdapter } from '../src/providers/openai.js';
import { anthropicAdapter } from '../src/providers/anthropic.js';
import { geminiAdapter } from '../src/providers/gemini.js';
import type { ResolvedPromptAsset } from '../src/schema/index.js';

const baseAsset: ResolvedPromptAsset = {
  id: 'test',
  schema_version: 1,
  provider: 'openai',
  model: 'gpt-5.4',
  sampling: { temperature: 0.7, max_output_tokens: 1024 },
  sections: {
    system_instructions: 'You are a test assistant.',
    prompt_template: 'Hello {{ name }}.',
  },
  source: { file_path: 'test.md' },
};

describe('OpenAI adapter', () => {
  it('renders a valid request body', () => {
    const result = openaiAdapter.render(baseAsset, {
      variables: { name: 'World' },
    });

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-5.4');
    expect(result.body.model).toBe('gpt-5.4');
    expect(result.body.temperature).toBe(0.7);
    expect(result.body.max_tokens).toBe(1024);

    const messages = result.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: 'system', content: 'You are a test assistant.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hello World.' });
  });

  it('includes history messages', () => {
    const result = openaiAdapter.render(baseAsset, {
      variables: { name: 'World' },
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    });

    const messages = result.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(4); // system + 2 history + user
  });
});

describe('Anthropic adapter', () => {
  it('renders with system as top-level field', () => {
    const result = anthropicAdapter.render(
      { ...baseAsset, provider: 'anthropic', model: 'claude-sonnet-4-6' },
      { variables: { name: 'World' } },
    );

    expect(result.provider).toBe('anthropic');
    expect(result.body.system).toBe('You are a test assistant.');
    expect(result.body.model).toBe('claude-sonnet-4-6');

    const messages = result.body.messages as Array<{ role: string; content: string }>;
    // Anthropic doesn't have system in messages
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello World.' });
  });

  it('defaults max_tokens when not set', () => {
    const assetNoMax = { ...baseAsset, sampling: { temperature: 0.7 } };
    const result = anthropicAdapter.render(assetNoMax, { variables: { name: 'World' } });
    expect(result.body.max_tokens).toBe(4096);
  });
});

describe('Gemini adapter', () => {
  it('renders with systemInstruction and contents', () => {
    const result = geminiAdapter.render(
      { ...baseAsset, provider: 'google', model: 'gemini-2.5-flash' },
      { variables: { name: 'World' } },
    );

    expect(result.provider).toBe('gemini');
    expect(result.body.systemInstruction).toEqual({
      parts: [{ text: 'You are a test assistant.' }],
    });

    const contents = result.body.contents as Array<{ role: string; parts: unknown[] }>;
    expect(contents[0]).toEqual({
      role: 'user',
      parts: [{ text: 'Hello World.' }],
    });
  });
});
