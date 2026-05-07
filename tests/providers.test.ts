import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openaiAdapter } from '../src/providers/openai.js';
import { openaiResponsesAdapter } from '../src/providers/openai-responses.js';
import { anthropicAdapter } from '../src/providers/anthropic.js';
import { geminiAdapter } from '../src/providers/gemini.js';
import { openrouterAdapter } from '../src/providers/openrouter.js';
import {
  createLLMAsAServiceOpenAIConfig,
  llmasaserviceAdapter,
} from '../src/providers/llmasaservice.js';
import { getAdapter } from '../src/providers/index.js';
import { PromptAssetSchema } from '../src/schema/index.js';
import type { ResolvedPromptAsset } from '../src/schema/index.js';
import { createPromptOpsKit } from '../src/index.js';

const adaptersWithPromptInput = [openaiAdapter, openaiResponsesAdapter, anthropicAdapter, geminiAdapter, openrouterAdapter, llmasaserviceAdapter] as const;

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

  it('maps response.schema_description and raw OpenAI fields', () => {
    const result = openaiAdapter.render(
      {
        ...baseAsset,
        response: {
          format: 'json',
          schema_name: 'support_response',
          schema_description: 'A short support answer.',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
          },
        },
        raw: {
          openai: {
            user: 'user_123',
            service_tier: 'flex',
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'support_response',
        description: 'A short support answer.',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
        },
        strict: true,
      },
    });
    expect(result.body.user).toBe('user_123');
    expect(result.body.service_tier).toBe('flex');
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

  it('compacts history directly from adapter render when max_items is exceeded', () => {
    const result = openaiAdapter.render(
      {
        ...baseAsset,
        context: {
          history: { max_items: 2 },
        },
      },
      {
        variables: { name: 'World' },
        history: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'second' },
          { role: 'user', content: 'third' },
        ],
        onHistoryCompaction: (info) => `Compacted ${info.overflow.length} message(s).`,
      },
    );

    const messages = result.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'Compacted 2 message(s).' },
      { role: 'user', content: 'third' },
      { role: 'user', content: 'Hello World.' },
    ]);
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

  it('maps OpenAI cache settings into request fields', () => {
    const result = openaiAdapter.render(
      {
        ...baseAsset,
        cache: {
          openai: {
            prompt_cache_key: 'support-reply-v1',
            retention: '24h',
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.prompt_cache_key).toBe('support-reply-v1');
    expect(result.body.prompt_cache_retention).toBe('24h');
  });

  it('ignores non-OpenAI cache config when rendering OpenAI payloads', () => {
    const result = openaiAdapter.render(
      {
        ...baseAsset,
        cache: {
          anthropic: { mode: 'automatic', ttl: '1h' },
          gemini: { cached_content: 'cachedContents/ignored-for-openai' },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.prompt_cache_key).toBeUndefined();
    expect(result.body.prompt_cache_retention).toBeUndefined();
    expect(result.body.cache_control).toBeUndefined();
    expect(result.body.cachedContent).toBeUndefined();
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

  it('maps response.schema_description and raw Responses fields', () => {
    const result = openaiResponsesAdapter.render(
      {
        ...baseAsset,
        response: {
          format: 'json',
          schema_name: 'reply_schema',
          schema_description: 'A structured reply.',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
          },
        },
        raw: {
          openai_responses: {
            truncation: 'auto',
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'reply_schema',
        description: 'A structured reply.',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
        },
        strict: true,
      },
    });
    expect(result.body.truncation).toBe('auto');
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

  it('reports Responses-specific validation warnings and model errors', () => {
    const validation = openaiResponsesAdapter.validate({
      ...baseAsset,
      model: undefined,
      reasoning: { budget_tokens: 1000 },
      response: {
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
        },
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('OpenAI Responses adapter requires a model to be specified.');
    expect(validation.warnings).toContain(
      'OpenAI Responses uses reasoning.effort, not budget_tokens. budget_tokens will be ignored.',
    );
    expect(validation.warnings).toContain(
      'OpenAI Responses response.schema requires response.format: json. schema will still be applied as JSON schema output.',
    );
  });

  it('renders default schema names, non-strict schemas, unknown tool stubs, and conversation ids', () => {
    const result = openaiResponsesAdapter.render(
      {
        ...baseAsset,
        response: {
          format: 'json',
          schema_strict: false,
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
          },
        },
        tools: ['lookup_customer'],
      },
      {
        variables: { name: 'World' },
        openaiResponses: {
          conversation: 'conv_456',
        },
      },
    );

    expect(result.body.conversation).toBe('conv_456');
    expect(result.body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'test_response',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
        },
        strict: false,
      },
    });
    expect(result.body.tools).toEqual([{ type: 'function', name: 'lookup_customer' }]);
  });

  it('rejects invalid Responses runtime options through PromptOpsKit.renderPrompt', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    await expect(
      kit.renderPrompt({
        provider: 'openai-responses',
        source: [
          '---',
          'id: inline-responses',
          'provider: openai-responses',
          'model: gpt-5.4',
          '---',
          '',
          '# Prompt template',
          '',
          'Hello.',
        ].join('\n'),
        openaiResponses: {
          previous_response_id: 'resp_123',
          conversation: 'conv_456',
        },
      }),
    ).rejects.toThrow('OpenAI Responses options "conversation" and "previous_response_id" cannot both be set.');
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

  it('supports Anthropic automatic caching via top-level cache_control', () => {
    const result = anthropicAdapter.render(
      {
        ...baseAsset,
        cache: {
          anthropic: {
            mode: 'automatic',
            ttl: '1h',
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('supports Anthropic explicit block-level cache_control', () => {
    const result = anthropicAdapter.render(
      {
        ...baseAsset,
        tools: ['lookup_account'],
        cache: {
          anthropic: {
            mode: 'explicit',
            cache_system_instructions: true,
            cache_tools: true,
            cache_prompt_template: true,
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.cache_control).toBeUndefined();
    expect(result.body.system).toEqual([
      { type: 'text', text: 'You are a test assistant.', cache_control: { type: 'ephemeral' } },
    ]);

    const messages = result.body.messages as Array<{ role: string; content: unknown }>;
    expect(messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'Hello World.', cache_control: { type: 'ephemeral' } }],
    });

    const tools = result.body.tools as Array<Record<string, unknown>>;
    expect(tools[0]).toEqual({ name: 'lookup_account', cache_control: { type: 'ephemeral' } });
  });

  it('ignores non-Anthropic cache config when rendering Anthropic payloads', () => {
    const result = anthropicAdapter.render(
      {
        ...baseAsset,
        cache: {
          openai: { prompt_cache_key: 'ignored-for-anthropic', retention: '24h' },
          gemini: { cached_content: 'cachedContents/ignored-for-anthropic' },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.cache_control).toBeUndefined();
    expect(result.body.prompt_cache_key).toBeUndefined();
    expect(result.body.prompt_cache_retention).toBeUndefined();
    expect(result.body.cachedContent).toBeUndefined();
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

  it('maps response.schema to Anthropic output_config and applies raw Anthropic fields', () => {
    const result = anthropicAdapter.render(
      {
        ...baseAsset,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        response: {
          format: 'json',
          schema_name: 'support_response',
          schema_description: 'A structured support response.',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string' },
            },
            required: ['answer'],
          },
        },
        raw: {
          anthropic: {
            service_tier: 'auto',
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.output_config).toEqual({
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
          },
          required: ['answer'],
        },
      },
    });
    expect(result.body.service_tier).toBe('auto');
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
            response_json_schema: {
              type: 'object',
              properties: { exact: { type: 'boolean' } },
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
    expect(generationConfig.responseJsonSchema).toEqual({
      type: 'object',
      properties: { exact: { type: 'boolean' } },
    });
    expect(generationConfig.responseModalities).toEqual(['TEXT']);
    expect(result.body.thinkingConfig).toEqual({ thinkingBudget: 2500 });
  });

  it('applies raw Gemini fields', () => {
    const result = geminiAdapter.render(
      {
        ...baseAsset,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        raw: {
          gemini: {
            safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }],
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.safetySettings).toEqual([
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ]);
  });

  it('maps normalized response.schema to Gemini responseJsonSchema', () => {
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
    expect(generationConfig.responseJsonSchema).toEqual({
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
    });
    expect(generationConfig.responseSchema).toBeUndefined();
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

  it('supports cachedContent for Gemini context caching', () => {
    const result = geminiAdapter.render(
      {
        ...baseAsset,
        cache: {
          gemini: {
            cached_content: 'cachedContents/abc123',
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.cachedContent).toBe('cachedContents/abc123');
  });

  it('prefers cache.gemini over cache.google when both are present', () => {
    const result = geminiAdapter.render(
      {
        ...baseAsset,
        cache: {
          gemini: { cached_content: 'cachedContents/preferred' },
          google: { cached_content: 'cachedContents/fallback' },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.cachedContent).toBe('cachedContents/preferred');
  });

  it('warns when both cache.gemini and cache.google use different values', () => {
    const validation = geminiAdapter.validate({
      ...baseAsset,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      cache: {
        gemini: { cached_content: 'cachedContents/preferred' },
        google: { cached_content: 'cachedContents/fallback' },
      },
    });

    expect(validation.valid).toBe(true);
    expect(validation.warnings).toContain(
      'Both cache.gemini.cached_content and cache.google.cached_content are set. Gemini uses cache.gemini.cached_content.',
    );
  });

  it('ignores non-Gemini cache config when rendering Gemini payloads', () => {
    const result = geminiAdapter.render(
      {
        ...baseAsset,
        cache: {
          openai: { prompt_cache_key: 'ignored-for-gemini', retention: '24h' },
          anthropic: { mode: 'automatic', ttl: '1h' },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.cachedContent).toBeUndefined();
    expect(result.body.prompt_cache_key).toBeUndefined();
    expect(result.body.prompt_cache_retention).toBeUndefined();
    expect(result.body.cache_control).toBeUndefined();
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

  it('maps OpenRouter provider_options and raw OpenRouter fields', () => {
    const result = getAdapter('openrouter').render(
      {
        ...baseAsset,
        provider: 'openrouter',
        provider_options: {
          openrouter: {
            provider: { order: ['anthropic', 'openai'] },
            transforms: ['middle-out'],
            models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o'],
          },
        },
        raw: {
          openrouter: {
            usage: { include: true },
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.provider).toBe('openrouter');
    expect(result.body.provider).toEqual({ order: ['anthropic', 'openai'] });
    expect(result.body.transforms).toEqual(['middle-out']);
    expect(result.body.models).toEqual(['anthropic/claude-sonnet-4.5', 'openai/gpt-4o']);
    expect(result.body.usage).toEqual({ include: true });
  });

  it('allows OpenRouter models without a single model', () => {
    const asset = {
      ...baseAsset,
      provider: 'openrouter',
      model: undefined,
      provider_options: {
        openrouter: {
          models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o'],
        },
      },
    };

    const validation = getAdapter('openrouter').validate(asset);
    const result = getAdapter('openrouter').render(asset, { variables: { name: 'World' } });

    expect(validation.valid).toBe(true);
    expect(result.model).toBe('anthropic/claude-sonnet-4.5');
    expect(result.body.model).toBeUndefined();
    expect(result.body.models).toEqual(['anthropic/claude-sonnet-4.5', 'openai/gpt-4o']);
  });

  it('does not apply raw.openai when rendering OpenRouter', () => {
    const result = getAdapter('openrouter').render(
      {
        ...baseAsset,
        provider: 'openrouter',
        raw: {
          openai: {
            user: 'openai-only',
          },
          openrouter: {
            usage: { include: true },
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.body.user).toBeUndefined();
    expect(result.body.usage).toEqual({ include: true });
  });
});

describe('LLMAsAService adapter', () => {
  it('renders OpenAI-compatible body fields with gateway customer metadata and project header', () => {
    const result = getAdapter('llmasaservice').render(
      {
        ...baseAsset,
        provider: 'llmasaservice',
        model: 'openai:gpt-5.2',
        response: { stream: true },
        provider_options: {
          llmasaservice: {
            project_id: 'proj_123',
            customer: {
              customer_id: 'cust_123',
              customer_name: 'Acme',
              customer_user_id: 'user_456',
              customer_user_name: 'Jane Customer',
              customer_user_email: 'jane@example.com',
            },
            conversationId: 'conv_123',
            conversationTitle: 'Support thread',
          },
        },
        raw: {
          llmasaservice: {
            service_tier: 'gateway-test',
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(result.provider).toBe('llmasaservice');
    expect(result.model).toBe('openai:gpt-5.2');
    expect(result.baseURL).toBe('https://gateway.llmasaservice.io');
    expect(result.headers).toEqual({ 'x-project-id': 'proj_123' });
    expect(result.body.model).toBe('openai:gpt-5.2');
    expect(result.body.stream).toBe(true);
    expect(result.body.max_completion_tokens).toBe(1024);
    expect(result.body.max_tokens).toBeUndefined();
    expect(result.body.customer).toEqual({
      customer_id: 'cust_123',
      customer_name: 'Acme',
      customer_user_id: 'user_456',
      customer_user_name: 'Jane Customer',
      customer_user_email: 'jane@example.com',
    });
    expect(result.body.conversationId).toBe('conv_123');
    expect(result.body.conversationTitle).toBe('Support thread');
    expect(result.body.service_tier).toBe('gateway-test');
  });

  it('uses group:standard when no model is configured', () => {
    const validation = getAdapter('llmasaservice').validate({
      ...baseAsset,
      provider: 'llmasaservice',
      model: undefined,
      provider_options: {
        llmasaservice: {
          project_id: 'proj_123',
          customer: {
            customer_id: 'cust_123',
          },
        },
      },
    });
    const result = getAdapter('llmasaservice').render(
      {
        ...baseAsset,
        provider: 'llmasaservice',
        model: undefined,
        provider_options: {
          llmasaservice: {
            project_id: 'proj_123',
            customer: {
              customer_id: 'cust_123',
            },
          },
        },
      },
      { variables: { name: 'World' } },
    );

    expect(validation.valid).toBe(true);
    expect(result.model).toBe('group:standard');
    expect(result.body.model).toBe('group:standard');
  });

  it('creates an OpenAI SDK config shape from explicit gateway options', () => {
    const config = createLLMAsAServiceOpenAIConfig({
      baseURL: 'https://gateway.example',
      projectId: 'proj_123',
    });

    expect(config).toEqual({
      baseURL: 'https://gateway.example',
      apiKey: 'not-used-by-llm-gateway',
      defaultHeaders: {
        'x-project-id': 'proj_123',
      },
    });
  });

  it('warns when gateway metadata will need render-time values', () => {
    const validation = getAdapter('llmasaservice').validate({
      ...baseAsset,
      provider: 'llmasaservice',
      model: 'group:standard',
    });

    expect(validation.valid).toBe(true);
    expect(validation.warnings).toContain(
      'LLMAsAService project_id and customer.customer_id must be supplied before rendering, usually through runtime provider_options.',
    );
  });

  it('validates required gateway routing and customer metadata at render time', () => {
    const validation = getAdapter('llmasaservice').validate(
      {
        ...baseAsset,
        provider: 'llmasaservice',
        model: 'group:standard',
      },
      { runtime: {} },
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      'LLMAsAService adapter requires provider_options.llmasaservice.project_id for x-project-id routing.',
    );
    expect(validation.errors).toContain(
      'LLMAsAService adapter requires customer.customer_id in provider_options.llmasaservice.customer or raw.llmasaservice.customer.',
    );
  });

  it('requires project_id specifically for the x-project-id header', () => {
    const validation = getAdapter('llmasaservice').validate(
      {
        ...baseAsset,
        provider: 'llmasaservice',
        model: 'group:standard',
      },
      {
        runtime: {
          provider_options: {
            llmasaservice: {
              projectId: 'proj_123',
              customer: {
                customer_id: 'cust_123',
              },
            },
          },
        },
      },
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      'LLMAsAService adapter requires provider_options.llmasaservice.project_id for x-project-id routing.',
    );
  });

  it('validates gateway metadata after runtime overrides', () => {
    const validation = getAdapter('llmasaservice').validate(
      {
        ...baseAsset,
        provider: 'llmasaservice',
        model: 'group:standard',
      },
      {
        runtime: {
          provider_options: {
            llmasaservice: {
              project_id: 'proj_123',
              customer: {
                customer_id: 'cust_123',
              },
            },
          },
        },
      },
    );

    expect(validation.valid).toBe(true);
  });

  it('renders customer metadata from runtime overrides', () => {
    const result = getAdapter('llmasaservice').render(
      {
        ...baseAsset,
        provider: 'llmasaservice',
        model: 'group:standard',
      },
      {
        variables: { name: 'World' },
        runtime: {
          provider_options: {
            llmasaservice: {
              project_id: 'proj_123',
              customer: {
                customer_id: 'cust_runtime',
                customer_name: 'Runtime Customer',
              },
            },
          },
        },
      },
    );

    expect(result.headers).toEqual({ 'x-project-id': 'proj_123' });
    expect(result.body.customer).toEqual({
      customer_id: 'cust_runtime',
      customer_name: 'Runtime Customer',
    });
  });

  it('does not require process.env when explicit gateway options are provided', () => {
    const previousProcess = globalThis.process;

    try {
      // @ts-expect-error simulate browser or worker runtimes without a process global
      globalThis.process = undefined;

      const validation = getAdapter('llmasaservice').validate({
        ...baseAsset,
        provider: 'llmasaservice',
        model: 'group:standard',
        provider_options: {
          llmasaservice: {
            project_id: 'proj_123',
            customer: {
              customer_id: 'cust_123',
            },
          },
        },
      });
      const result = getAdapter('llmasaservice').render(
        {
          ...baseAsset,
          provider: 'llmasaservice',
          model: 'group:standard',
          provider_options: {
            llmasaservice: {
              project_id: 'proj_123',
              customer: {
                customer_id: 'cust_123',
              },
            },
          },
        },
        { variables: { name: 'World' } },
      );

      expect(validation.valid).toBe(true);
      expect(result.baseURL).toBe('https://gateway.llmasaservice.io');
      expect(result.headers).toEqual({ 'x-project-id': 'proj_123' });
    } finally {
      globalThis.process = previousProcess;
    }
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

  it('schema accepts llmasaservice as a provider value', () => {
    const result = PromptAssetSchema.safeParse({
      id: 'test',
      schema_version: 1,
      provider: 'llmasaservice',
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

  it('getAdapter resolves openai-responses, gemini, google, and llmasaservice', () => {
    expect(getAdapter('openai-responses').name).toBe('openai-responses');
    expect(getAdapter('gemini').name).toBe('gemini');
    expect(getAdapter('google').name).toBe('gemini');
    expect(getAdapter('llmasaservice').name).toBe('llmasaservice');
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
