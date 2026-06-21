import { describe, expect, it } from 'vitest';
import { createPromptOpsKit } from '../src/index.js';
import { openaiAdapter } from '../src/providers/openai.js';

function createCompressionFetch(calls: Array<{ url: string; init: RequestInit }>): typeof fetch {
  return async (url, init) => {
    calls.push({ url: String(url), init: init as RequestInit });

    return new Response(JSON.stringify({
      output: 'Compressed prompt.',
      output_tokens: 4,
      input_tokens: 12,
      tokens_saved: 8,
      compression_ratio: 3,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

describe('TheTokenCompany compression', () => {
  it('compresses rendered prompt template content before provider message generation', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: compression-test
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  thetokencompany:
    enabled: true
    model: bear-2
    aggressiveness: 0.2
---

# System instructions

Assist {{ company }}.

# Prompt template

Summarize this account for {{ name }}.`,
      variables: {
        company: 'Acme',
        name: 'Jordan',
      },
      theTokenCompany: {
        apiKey: 'ttc-test',
        fetch: createCompressionFetch(calls),
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.thetokencompany.com/v1/compress');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer ttc-test');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      model: 'bear-2',
      input: 'Summarize this account for Jordan.',
      compression_settings: { aggressiveness: 0.2 },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([
      { role: 'system', content: 'Assist Acme.' },
      { role: 'user', content: 'Compressed prompt.' },
    ]);
    expect(result.compression).toEqual([{
      provider: 'thetokencompany',
      model: 'bear-2',
      inputTokens: 12,
      outputTokens: 4,
      tokensSaved: 8,
      compressionRatio: 3,
    }]);
    expect(result.request!.compression).toEqual(result.compression);
  });

  it('applies provider cache settings to the compressed prompt text', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: compression-before-cache
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  thetokencompany:
    enabled: true
cache:
  openai:
    prompt_cache_key: compressed-v1
    retention: 24h
---

# Prompt template

Long stable prompt for {{ account }}.`,
      variables: { account: 'acct_123' },
      theTokenCompany: {
        apiKey: 'ttc-test',
        fetch: createCompressionFetch(calls),
      },
    });

    expect(JSON.parse(calls[0].init.body as string).input).toBe('Long stable prompt for acct_123.');

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: 'Compressed prompt.' }]);
    expect(result.request!.body.prompt_cache_key).toBe('compressed-v1');
    expect(result.request!.body.prompt_cache_retention).toBe('24h');
  });

  it('uses compressed prompt text inside Anthropic explicit cache control blocks', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'anthropic',
      source: `---
id: compression-before-anthropic-cache
schema_version: 1
provider: anthropic
model: claude-sonnet-4.5
compression:
  thetokencompany:
    enabled: true
cache:
  anthropic:
    mode: explicit
    ttl: 5m
    cache_prompt_template: true
---

# Prompt template

Long stable prompt for {{ account }}.`,
      variables: { account: 'acct_123' },
      theTokenCompany: {
        apiKey: 'ttc-test',
        fetch: createCompressionFetch(calls),
      },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: unknown }>;
    expect(messages).toEqual([{
      role: 'user',
      content: [{
        type: 'text',
        text: 'Compressed prompt.',
        cache_control: { type: 'ephemeral', ttl: '5m' },
      }],
    }]);
  });

  it('does not require an API key when compression is disabled', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: compression-disabled
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  thetokencompany:
    enabled: false
---

# Prompt template

Hello {{ name }}.`,
      variables: { name: 'World' },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: 'Hello World.' }]);
    expect(result.compression).toBeUndefined();
  });

  it('fails before provider rendering when compression is enabled without a key', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });
    const previousLongName = process.env.THETOKENCOMPANY_API_KEY;
    const previousShortName = process.env.TTC_API_KEY;
    delete process.env.THETOKENCOMPANY_API_KEY;
    delete process.env.TTC_API_KEY;

    try {
      await expect(
        kit.renderPrompt({
          provider: 'openai',
          source: `---
id: compression-no-key
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  thetokencompany:
    enabled: true
---

# Prompt template

Hello.`,
        }),
      ).rejects.toThrow(/no API key was provided/);
    } finally {
      if (previousLongName === undefined) {
        delete process.env.THETOKENCOMPANY_API_KEY;
      } else {
        process.env.THETOKENCOMPANY_API_KEY = previousLongName;
      }
      if (previousShortName === undefined) {
        delete process.env.TTC_API_KEY;
      } else {
        process.env.TTC_API_KEY = previousShortName;
      }
    }
  });

  it('supports compression through direct adapter renderPrompt and runtime overrides', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];

    const result = await openaiAdapter.renderPrompt(
      {
        source: `---
id: adapter-compression
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  thetokencompany:
    enabled: false
    aggressiveness: 0.1
---

# Prompt template

Rewrite {{ text }}.`,
      },
      {
        variables: { text: 'a long draft' },
        runtime: {
          compression: {
            thetokencompany: {
              enabled: true,
              aggressiveness: 0.4,
            },
          },
        },
        theTokenCompany: {
          apiKey: 'ttc-runtime',
          fetch: createCompressionFetch(calls),
        },
      },
    );

    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      model: 'bear-2',
      input: 'Rewrite a long draft.',
      compression_settings: { aggressiveness: 0.4 },
    });

    const messages = result.body!.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: 'Compressed prompt.' }]);
    expect(result.compression?.[0]?.tokensSaved).toBe(8);
  });
});
