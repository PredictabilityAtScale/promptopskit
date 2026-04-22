import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openaiAdapter } from '../src/providers/openai.js';
import { anthropicAdapter } from '../src/providers/anthropic.js';
import { geminiAdapter } from '../src/providers/gemini.js';
import { getAdapter } from '../src/providers/index.js';
import { PromptAssetSchema } from '../src/schema/index.js';
import type { ResolvedPromptAsset } from '../src/schema/index.js';
import { createPromptOpsKit } from '../src/index.js';

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

  it('applies environment overrides during direct adapter render', () => {
    const result = openaiAdapter.render(
      {
        ...baseAsset,
        environments: {
          dev: {
            model: 'gpt-5.4-mini',
            sampling: { temperature: 0.2 },
          },
        },
      },
      {
        environment: 'dev',
        variables: { name: 'World' },
      },
    );

    expect(result.model).toBe('gpt-5.4-mini');
    expect(result.body.model).toBe('gpt-5.4-mini');
    expect(result.body.temperature).toBe(0.2);
  });

  it('uses override-selected model during validation', () => {
    const validation = openaiAdapter.validate(
      {
        ...baseAsset,
        model: undefined,
        environments: {
          dev: {
            model: 'gpt-5.4-mini',
          },
        },
      },
      {
        environment: 'dev',
      },
    );

    expect(validation.valid).toBe(true);
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

  it('renders directly from a prompt path', async () => {
    const result = await openaiAdapter.renderPrompt(
      {
        path: 'hello',
        sourceDir: path.resolve('fixtures/prompts'),
        compiledDir: path.resolve('fixtures/compiled'),
      },
      {
        variables: {
          name: 'World',
          app_context: 'support chat',
        },
      },
    );

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-5.4');

    const messages = result.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are a friendly assistant helping in support chat.',
    });
    expect(messages[1]).toEqual({ role: 'user', content: 'Say hello to World.' });
  });

  it('renders directly from a prompt path using default folders', async () => {
    const cwd = process.cwd();
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'pok-provider-'));
    const promptsDir = path.join(tmpDir, 'prompts');
    const compiledDir = path.join(tmpDir, '.generated-prompts', 'json');

    await mkdir(compiledDir, { recursive: true });
    await mkdir(promptsDir, { recursive: true });

    await writeFile(path.join(promptsDir, 'hello.md'), `---
id: hello
schema_version: 1
provider: openai
model: gpt-5.4
---

# Prompt template

Hello {{ name }}.
`);

    await writeFile(path.join(compiledDir, 'hello.json'), `${JSON.stringify({
      id: 'hello',
      schema_version: 1,
      provider: 'openai',
      model: 'gpt-5.4',
      sections: {
        system_instructions: 'From compiled.',
        prompt_template: 'Hello {{ name }}.',
      },
    }, null, 2)}\n`);

    process.chdir(tmpDir);

    try {
      const result = await openaiAdapter.renderPrompt(
        {
          path: 'hello',
        },
        {
          variables: {
            name: 'World',
          },
        },
      );

      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-5.4');

      const messages = result.body.messages as Array<{ role: string; content: string }>;
      expect(messages[0]).toEqual({ role: 'system', content: 'From compiled.' });
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello World.' });
    } finally {
      process.chdir(cwd);
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('validates inline prompt source with defaults applied by runtime overrides', async () => {
    const validation = await openaiAdapter.validatePrompt(
      {
        source: [
          '---',
          'id: inline',
          'provider: openai',
          'model: gpt-5.4',
          '---',
          '',
          '# Prompt template',
          '',
          'Summarize {{ subject }}.',
        ].join('\n'),
      },
      {
        environment: 'dev',
      },
    );

    expect(validation.valid).toBe(true);
  });

  it('renders a resolved asset through renderPrompt without misclassifying source metadata', async () => {
    const result = await openaiAdapter.renderPrompt(baseAsset, {
      variables: { name: 'World' },
    });

    expect(result.provider).toBe('openai');

    const messages = result.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: 'system', content: 'You are a test assistant.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hello World.' });
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

  it('applies environment overrides during direct adapter render', () => {
    const result = anthropicAdapter.render(
      {
        ...baseAsset,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        environments: {
          dev: {
            model: 'claude-haiku-4-5',
            response: { stream: true },
          },
        },
      },
      {
        environment: 'dev',
        variables: { name: 'World' },
      },
    );

    expect(result.model).toBe('claude-haiku-4-5');
    expect(result.body.model).toBe('claude-haiku-4-5');
    expect(result.body.stream).toBe(true);
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

  it('applies tier and runtime overrides during direct adapter render', () => {
    const result = geminiAdapter.render(
      {
        ...baseAsset,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        tiers: {
          pro: {
            model: 'gemini-2.5-pro',
            sampling: { temperature: 0.1 },
          },
        },
      },
      {
        tier: 'pro',
        runtime: {
          response: { format: 'json' },
        },
        variables: { name: 'World' },
      },
    );

    expect(result.model).toBe('gemini-2.5-pro');
    expect((result.body.generationConfig as Record<string, unknown>).temperature).toBe(0.1);
    expect((result.body.generationConfig as Record<string, unknown>).responseMimeType).toBe('application/json');
  });
});

describe('OpenRouter adapter', () => {
  it('applies environment overrides during direct adapter render', () => {
    const result = getAdapter('openrouter').render(
      {
        ...baseAsset,
        provider: 'openrouter',
        environments: {
          dev: {
            model: 'openai/gpt-5.4-mini',
          },
        },
      },
      {
        environment: 'dev',
        variables: { name: 'World' },
      },
    );

    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('openai/gpt-5.4-mini');
    expect(result.body.model).toBe('openai/gpt-5.4-mini');
  });
});

describe('Provider naming', () => {
  it('schema accepts gemini as a provider value', () => {
    const result = PromptAssetSchema.safeParse({
      id: 'test',
      schema_version: 1,
      provider: 'gemini',
    });
    expect(result.success).toBe(true);
  });

  it('schema still accepts google as a provider value', () => {
    const result = PromptAssetSchema.safeParse({
      id: 'test',
      schema_version: 1,
      provider: 'google',
    });
    expect(result.success).toBe(true);
  });

  it('getAdapter resolves both gemini and google', () => {
    expect(getAdapter('gemini').name).toBe('gemini');
    expect(getAdapter('google').name).toBe('gemini');
  });
});

describe('Adapter validation on render', () => {
  it('openai adapter reports error for missing model', () => {
    const validation = openaiAdapter.validate({
      ...baseAsset,
      model: undefined,
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('renderPrompt throws when adapter validation fails', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });
    await expect(
      kit.renderPrompt({
        source: `---\nid: no-model\nschema_version: 1\n---\n\n# Prompt template\n\nHello`,
        provider: 'openai',
      }),
    ).rejects.toThrow(/Provider validation failed/);
  });

  it('renderPrompt applies runtime overrides after environment and tier', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      source: `---
id: runtime-test
schema_version: 1
provider: openai
model: gpt-5.4
sampling:
  temperature: 0.7
environments:
  dev:
    model: gpt-5.4-mini
tiers:
  pro:
    model: gpt-5.4
---

# Prompt template

Hello {{ name }}`,
      provider: 'openai',
      environment: 'dev',
      tier: 'pro',
      runtime: {
        model: 'gpt-5.4-nano',
        sampling: { temperature: 0 },
      },
      variables: { name: 'World' },
    });

    expect(result.resolved.model).toBe('gpt-5.4-nano');
    expect(result.request.model).toBe('gpt-5.4-nano');
    expect(result.request.body.model).toBe('gpt-5.4-nano');
    expect(result.request.body.temperature).toBe(0);
  });
});
