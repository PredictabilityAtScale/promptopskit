import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openaiAdapter } from '../src/providers/openai.js';
import { openaiResponsesAdapter } from '../src/providers/openai-responses.js';
import { anthropicAdapter } from '../src/providers/anthropic.js';
import { geminiAdapter } from '../src/providers/gemini.js';
import { openrouterAdapter } from '../src/providers/openrouter.js';
import { getAdapter } from '../src/providers/index.js';
import { PromptAssetSchema } from '../src/schema/index.js';
import type { ResolvedPromptAsset } from '../src/schema/index.js';
import { createPromptOpsKit } from '../src/index.js';

const adaptersWithPromptInput = [openaiAdapter, openaiResponsesAdapter, anthropicAdapter, geminiAdapter, openrouterAdapter] as const;

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

  it('maps response.schema to OpenAI json_schema response_format', () => {
    const result = openaiAdapter.render(
      {
        ...baseAsset,
        response: {
          format: 'json',
          schema_name: 'support_response',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
            required: ['answer'],
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'support_response',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
          required: ['answer'],
        },
        strict: true,
      },
    });
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
    expect(result.returnMessage).toBeUndefined();

    const messages = result.body!.messages as Array<{ role: string; content: string }>;
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
      expect(result.returnMessage).toBeUndefined();

      const messages = result.body!.messages as Array<{ role: string; content: string }>;
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
    expect(result.returnMessage).toBeUndefined();

    const messages = result.body!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: 'system', content: 'You are a test assistant.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hello World.' });
  });

  it('returns a structured returnMessage from adapter.renderPrompt when configured', async () => {
    const result = await openaiAdapter.renderPrompt(
      {
        source: `---
id: inline-return-message
provider: openai
model: gpt-5.4
context:
  inputs:
    - name: user_message
      non_empty:
        return_message: "Please enter a non-empty message."
---

# Prompt template

Message: {{ user_message }}`,
      },
      {
        variables: { user_message: '   ' },
      },
    );

    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-5.4');
    expect(result.returnMessage).toBe('Please enter a non-empty message.');
    expect(result.body).toBeUndefined();
  });
});

describe('OpenAI Responses adapter', () => {
  it('renders a valid Responses API request body', () => {
    const result = openaiResponsesAdapter.render(baseAsset, {
      variables: { name: 'World' },
    });

    expect(result.provider).toBe('openai-responses');
    expect(result.model).toBe('gpt-5.4');
    expect(result.body.model).toBe('gpt-5.4');
    expect(result.body.temperature).toBe(0.7);
    expect(result.body.max_output_tokens).toBe(1024);

    expect(result.body.instructions).toBe('You are a test assistant.');

    const input = result.body.input as Array<{ role: string; content: string }>;
    expect(input[0]).toEqual({ role: 'user', content: 'Hello World.' });
  });

  it('maps reasoning, json response format, and tools to Responses API fields', () => {
    const result = openaiResponsesAdapter.render(
      {
        ...baseAsset,
        reasoning: { effort: 'high' },
        response: { format: 'json', stream: true },
        tools: [
          'lookup_customer',
          {
            name: 'search_orders',
            description: 'Search orders',
            input_schema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
            },
          },
        ],
      },
      {
        variables: { name: 'World' },
        toolRegistry: {
          lookup_customer: {
            type: 'function',
            name: 'lookup_customer',
            description: 'Find customer',
            parameters: {
              type: 'object',
              properties: {
                id: { type: 'string' },
              },
            },
          },
        },
      },
    );

    expect(result.body.reasoning).toEqual({ effort: 'high' });
    expect(result.body.text).toEqual({ format: { type: 'json_object' } });
    expect(result.body.stream).toBe(true);

    const tools = result.body.tools as Array<Record<string, unknown>>;
    expect(tools[0]).toEqual({
      type: 'function',
      name: 'lookup_customer',
      description: 'Find customer',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    });
    expect(tools[1]).toEqual({
      type: 'function',
      name: 'search_orders',
      description: 'Search orders',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
      },
    });
  });


  it('maps response.schema to Responses text.format json_schema', () => {
    const result = openaiResponsesAdapter.render(
      {
        ...baseAsset,
        response: {
          format: 'json',
          schema_name: 'reply_schema',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'reply_schema',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
        },
        strict: true,
      },
    });
  });

  it('supports Responses API conversation-state and execution options', () => {
    const result = openaiResponsesAdapter.render(baseAsset, {
      variables: { name: 'World' },
      openaiResponses: {
        instructions: 'Runtime instructions',
        previous_response_id: 'resp_123',
        parallel_tool_calls: false,
        max_tool_calls: 2,
        include: ['reasoning.encrypted_content'],
        metadata: { ticket: 'INC-42' },
        store: true,
        background: true,
      },
    });

    expect(result.body.instructions).toBe('Runtime instructions');
    expect(result.body.previous_response_id).toBe('resp_123');
    expect(result.body.parallel_tool_calls).toBe(false);
    expect(result.body.max_tool_calls).toBe(2);
    expect(result.body.include).toEqual(['reasoning.encrypted_content']);
    expect(result.body.metadata).toEqual({ ticket: 'INC-42' });
    expect(result.body.store).toBe(true);
    expect(result.body.background).toBe(true);
  });

  it('reports invalid runtime option combinations during validation', () => {
    const validation = openaiResponsesAdapter.validate(baseAsset, {
      openaiResponses: {
        previous_response_id: 'resp_123',
        conversation: 'conv_456',
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      'OpenAI Responses options "conversation" and "previous_response_id" cannot both be set.',
    );
  });

  it('includes history messages as input items', () => {
    const result = openaiResponsesAdapter.render(baseAsset, {
      variables: { name: 'World' },
      history: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    });

    const input = result.body.input as Array<{ role: string; content: string }>;
    expect(input).toHaveLength(3);
    expect(input[0]).toEqual({ role: 'user', content: 'Hi' });
    expect(input[1]).toEqual({ role: 'assistant', content: 'Hello!' });
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

  it('maps response.schema to OpenAI json_schema response_format', () => {
    const result = openaiAdapter.render(
      {
        ...baseAsset,
        response: {
          format: 'json',
          schema_name: 'support_response',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
            required: ['answer'],
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'support_response',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
          required: ['answer'],
        },
        strict: true,
      },
    });
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


  it('maps provider_options for top_k and tool_choice', () => {
    const result = anthropicAdapter.render(
      {
        ...baseAsset,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider_options: {
          anthropic: {
            top_k: 20,
            tool_choice: { type: 'auto' },
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.top_k).toBe(20);
    expect(result.body.tool_choice).toEqual({ type: 'auto' });
  });

  it('merges provider_options through environment and runtime overrides', () => {
    const result = anthropicAdapter.render(
      {
        ...baseAsset,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        provider_options: { anthropic: { top_k: 10 } },
        environments: {
          dev: {
            provider_options: { anthropic: { tool_choice: { type: 'none' } } },
          },
        },
      },
      {
        environment: 'dev',
        runtime: { provider_options: { anthropic: { top_k: 25 } } },
        variables: { name: 'World' },
      },
    );

    expect(result.body.top_k).toBe(25);
    expect(result.body.tool_choice).toEqual({ type: 'none' });
  });
});

describe('shared prompt-input validation across providers', () => {
  it.each(adaptersWithPromptInput)(
    'returns returnMessage before provider shaping for %s',
    async (adapter) => {
      const result = await adapter.renderPrompt(
        {
          source: `---
id: shared-return-message
schema_version: 1
provider: any
model: gpt-5.4
context:
  inputs:
    - name: user_message
      non_empty:
        return_message: "Please enter a non-empty message."
---

# Prompt template

Message: {{ user_message }}`,
        },
        {
          variables: { user_message: '   ' },
        },
      );

      expect(result.provider).toBe(adapter.name);
      expect(result.returnMessage).toBe('Please enter a non-empty message.');
      expect('body' in result ? result.body : undefined).toBeUndefined();
    },
  );
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

  it('warns that response.stream is not body-mapped for Gemini', () => {
    const validation = geminiAdapter.validate({
      ...baseAsset,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      response: { stream: true },
    });

    expect(validation.valid).toBe(true);
    expect(validation.warnings).toContain(
      'Gemini streaming is endpoint-based (streamGenerateContent), not body-based. response.stream will be ignored.',
    );
  });

  it('maps gemini provider_options into generationConfig and thinkingConfig', () => {
    const result = geminiAdapter.render(
      {
        ...baseAsset,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        provider_options: {
          gemini: {
            candidate_count: 2,
            top_k: 40,
            seed: 7,
            response_schema: {
              type: 'object',
              properties: { answer: { type: 'string' } },
            },
            response_modalities: ['TEXT'],
            thinking_budget_tokens: 2500,
          },
        },
      },
      { variables: { name: 'World' } },
    );

    const generationConfig = result.body.generationConfig as Record<string, unknown>;
    expect(generationConfig.candidateCount).toBe(2);
    expect(generationConfig.topK).toBe(40);
    expect(generationConfig.seed).toBe(7);
    expect(generationConfig.responseSchema).toEqual({
      type: 'object',
      properties: { answer: { type: 'string' } },
    });
    expect(generationConfig.responseModalities).toEqual(['TEXT']);
    expect(result.body.thinkingConfig).toEqual({ thinkingBudget: 2500 });
  });

  it('maps normalized response.schema to Gemini responseSchema', () => {
    const result = geminiAdapter.render(
      {
        ...baseAsset,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        response: {
          format: 'json',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
          },
        },
      },
      { variables: { name: 'World' } },
    );

    const generationConfig = result.body.generationConfig as Record<string, unknown>;
    expect(generationConfig.responseSchema).toEqual({
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
    });
    expect(generationConfig.responseMimeType).toBe('application/json');
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
  it('maps response.schema to OpenAI json_schema response_format', () => {
    const result = openaiAdapter.render(
      {
        ...baseAsset,
        response: {
          format: 'json',
          schema_name: 'support_response',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
            required: ['answer'],
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'support_response',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
          required: ['answer'],
        },
        strict: true,
      },
    });
  });

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
  it('schema accepts openai-responses as a provider value', () => {
    const result = PromptAssetSchema.safeParse({
      id: 'test',
      schema_version: 1,
      provider: 'openai-responses',
    });
    expect(result.success).toBe(true);
  });

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

  it('getAdapter resolves openai-responses, gemini, and google', () => {
    expect(getAdapter('openai-responses').name).toBe('openai-responses');
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
