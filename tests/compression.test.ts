import { describe, expect, it } from 'vitest';
import { createPromptOpsKit } from '../src/index.js';
import { openaiAdapter } from '../src/providers/openai.js';
import { compressHeuristicText } from '../src/token-compression.js';

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
    expect(result.compressionSummary).toEqual({
      steps: 1,
      inputTokens: 12,
      outputTokens: 4,
      tokensSaved: 8,
      reductionRatio: 8 / 12,
    });
    expect(result.request!.compressionSummary).toEqual(result.compressionSummary);
  });

  it('normalizes the current TheTokenCompany response payload shape', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const fetch: typeof globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });

      return new Response(JSON.stringify({
        output: 'Compressed prompt.',
        output_tokens: 437,
        original_input_tokens: 485,
        compression_time: 0,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: compression-current-ttc-payload
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  thetokencompany:
    enabled: true
---

# Prompt template

Summarize this account.`,
      theTokenCompany: {
        apiKey: 'ttc-test',
        fetch,
      },
    });

    expect(calls).toHaveLength(1);
    expect(result.compression).toEqual([{
      provider: 'thetokencompany',
      model: 'bear-2',
      inputTokens: 485,
      outputTokens: 437,
      tokensSaved: 48,
      compressionRatio: 485 / 437,
    }]);
    expect(result.compressionSummary).toEqual({
      steps: 1,
      inputTokens: 485,
      outputTokens: 437,
      tokensSaved: 48,
      reductionRatio: 48 / 485,
    });
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

  it('falls back to uncompressed prompt text when compression is enabled without a key', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });
    const previousLongName = process.env.THETOKENCOMPANY_API_KEY;
    const previousShortName = process.env.TTC_API_KEY;
    delete process.env.THETOKENCOMPANY_API_KEY;
    delete process.env.TTC_API_KEY;

    try {
      const result = await kit.renderPrompt({
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
      });

      const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
      expect(messages).toEqual([{ role: 'user', content: 'Hello.' }]);
      expect(result.compression).toEqual([{
        provider: 'thetokencompany',
        model: 'bear-2',
        inputTokens: 2,
        outputTokens: 2,
        tokensSaved: 0,
        compressionRatio: 1,
      }]);
      expect(result.compressionSummary).toEqual({
        steps: 1,
        inputTokens: 2,
        outputTokens: 2,
        tokensSaved: 0,
        reductionRatio: 0,
      });
      expect(result.warnings).toContain(
        'POK057: TheTokenCompany compression skipped; using uncompressed prompt with zero token savings (no API key was provided).',
      );
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

  it('falls back to uncompressed prompt text when TheTokenCompany returns an error', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const fetch: typeof globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });

      return new Response('temporary outage', { status: 503 });
    };

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: compression-http-fallback
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  thetokencompany:
    enabled: true
---

# Prompt template

Summarize this account.`,
      theTokenCompany: {
        apiKey: 'ttc-test',
        fetch,
      },
    });

    expect(calls).toHaveLength(1);
    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: 'Summarize this account.' }]);
    expect(result.compression).toEqual([{
      provider: 'thetokencompany',
      model: 'bear-2',
      inputTokens: 4,
      outputTokens: 4,
      tokensSaved: 0,
      compressionRatio: 1,
    }]);
    expect(result.compressionSummary).toEqual({
      steps: 1,
      inputTokens: 4,
      outputTokens: 4,
      tokensSaved: 0,
      reductionRatio: 0,
    });
    expect(result.warnings).toContain(
      'POK057: TheTokenCompany compression skipped; using uncompressed prompt with zero token savings (service returned HTTP 503).',
    );
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
    expect(result.compressionSummary).toEqual({
      steps: 1,
      inputTokens: 12,
      outputTokens: 4,
      tokensSaved: 8,
      reductionRatio: 8 / 12,
    });
  });
});

describe('heuristic compression', () => {
  it('skips conservative compression when no sentence matches the query', () => {
    const input = [
      'Pricing includes annual discounts for enterprise buyers.',
      'Security controls include SSO and audit logs.',
      'Renewal notices are sent thirty days before expiration.',
    ].join(' ');

    const result = compressHeuristicText(input, {
      min_tokens: 1,
      max_sentences: 1,
      target_reduction: 0.8,
      query: 'refund policy',
    });

    expect(result.output).toBe(input);
    expect(result.tokensSaved).toBe(0);
    expect(result.warnings).toContain(
      'Heuristic compression skipped because no sentence matched the relevance query.',
    );
  });

  it('allows balanced best-effort compression when low-confidence extraction is acceptable', () => {
    const input = [
      'Pricing includes annual discounts for enterprise buyers.',
      'Security controls include SSO and audit logs.',
      'Renewal notices are sent thirty days before expiration.',
    ].join(' ');

    const result = compressHeuristicText(input, {
      mode: 'balanced',
      min_tokens: 1,
      max_sentences: 1,
      target_reduction: 0.8,
      query: 'refund policy',
    });

    expect(result.output).not.toBe(input);
    expect(result.warnings).toBeUndefined();
  });

  it('keeps whole sentences instead of truncating selected output to a token budget', () => {
    const input = [
      'Pricing includes annual discounts for enterprise buyers and renewal approval timing that must remain intact.',
      'Security controls include SSO and audit logs.',
    ].join(' ');

    const result = compressHeuristicText(input, {
      min_tokens: 1,
      max_sentences: 1,
      target_reduction: 0.9,
      query: 'pricing',
      preserve_neighbors: false,
    });

    expect(result.output).toBe(
      'Pricing includes annual discounts for enterprise buyers and renewal approval timing that must remain intact.',
    );
  });

  it('includes neighboring context for conservative query matches when capacity allows', () => {
    const input = [
      'Enterprise policy defines the premium support tier.',
      'It requires P1 response within 15 minutes.',
      'General release notes describe unrelated rollout sequencing.',
    ].join(' ');

    const result = compressHeuristicText(input, {
      min_tokens: 1,
      max_sentences: 3,
      target_reduction: 0.7,
      query: 'P1 response',
    });

    expect(result.output).toContain('Enterprise policy defines the premium support tier.');
    expect(result.output).toContain('It requires P1 response within 15 minutes.');
  });

  it('preserves structured blocks in conservative mode', () => {
    const input = [
      '| field | value |',
      '| --- | --- |',
      '| SLA | P1 response in 15 minutes |',
      '',
      'Narrative context mentions support.',
    ].join('\n');

    const result = compressHeuristicText(input, {
      min_tokens: 1,
      max_sentences: 1,
      target_reduction: 0.8,
      query: 'SLA',
    });

    expect(result.output).toBe(input);
    expect(result.warnings).toContain(
      'Heuristic compression skipped because the input appears to contain structured blocks; use TOON or code compaction for structured content.',
    );
  });

  it('threads conservative placeholder options through schema and rendering', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-context-neighbors
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - name: account_context
      compression:
        heuristic:
          enabled: true
          mode: conservative
          preserve_neighbors: true
          fail_on_low_confidence: true
          min_tokens: 1
          max_sentences: 3
          target_reduction: 0.7
          query: P1 response
---

# Prompt template

Context: {{ account_context }}`,
      variables: {
        account_context: [
          'Enterprise policy defines the premium support tier.',
          'It requires P1 response within 15 minutes.',
          'General release notes describe unrelated rollout sequencing.',
        ].join(' '),
      },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain('Enterprise policy defines the premium support tier.');
    expect(messages[0].content).toContain('It requires P1 response within 15 minutes.');
  });

  it('compresses the rendered prompt template without backend credentials', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-prompt
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  heuristic:
    enabled: true
    min_tokens: 10
    max_sentences: 1
    target_reduction: 0.45
    query: pricing
---

# Prompt template

Pricing includes annual discounts for enterprise buyers. Security controls include SSO and audit logs. This document is confidential and intended for internal planning only.`,
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([
      { role: 'user', content: 'Pricing includes annual discounts for enterprise buyers.' },
    ]);
    expect(result.compression).toEqual([
      expect.objectContaining({
        provider: 'heuristic',
        model: 'local-heuristic-v1',
        scope: 'prompt_template',
      }),
    ]);
    expect(result.compression?.[0]?.tokensSaved).toBeGreaterThan(0);
  });

  it('compresses configured context inputs before placeholder insertion', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-context-input
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - name: account_context
      compression:
        heuristic:
          enabled: true
          min_tokens: 20
          max_sentences: 1
          target_reduction: 0.45
          query: support
---

# Prompt template

Context: {{ account_context }}`,
      variables: {
        account_context: [
          'Pricing includes annual discounts for enterprise buyers.',
          'Support SLA is 99.9 percent uptime with P1 response in 15 minutes.',
          'This document is confidential and intended for internal planning only.',
        ].join(' '),
      },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([
      { role: 'user', content: 'Context: Support SLA is 99.9 percent uptime with P1 response in 15 minutes.' },
    ]);
    expect(result.compression).toEqual([
      expect.objectContaining({
        provider: 'heuristic',
        scope: 'placeholder',
        variable: 'account_context',
      }),
    ]);
  });

  it('supports opt-in placeholder compression with a tag', async () => {
    const repeatedContext = Array.from({ length: 20 }, (_, index) =>
      index === 6
        ? 'Pricing terms include annual discounts for enterprise buyers and renewal approval timing.'
        : `General planning note ${index} repeats background details for rollout sequencing and coordination.`
    ).join(' ');
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-placeholder-tag
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - account_context
---

# Prompt template

Question: pricing
Context: {{ account_context | compress }}`,
      variables: {
        account_context: repeatedContext,
      },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain('Question: pricing');
    expect(messages[0].content).toContain('Pricing terms include annual discounts');
    expect(messages[0].content.length).toBeLessThan(`Question: pricing\nContext: ${repeatedContext}`.length);
    expect(result.compression?.[0]).toEqual(expect.objectContaining({
      provider: 'heuristic',
      scope: 'placeholder',
      variable: 'account_context',
    }));
  });

  it('preprocesses whole JSON prompt templates to TOON when enabled', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-json-toon
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  heuristic:
    enabled: true
    json_to_toon: true
---

# Prompt template

{"users":[{"id":1,"name":"Alice","role":"admin"},{"id":2,"name":"Bob","role":"user"}],"active":true}`,
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{
      role: 'user',
      content: [
        'users[2]{id,name,role}:',
        '  1,Alice,admin',
        '  2,Bob,user',
        'active: true',
      ].join('\n'),
    }]);
    expect(result.compression?.[0]).toEqual(expect.objectContaining({
      provider: 'heuristic',
      scope: 'prompt_template',
      outputFormat: 'toon',
    }));
  });

  it('preprocesses configured JSON context inputs to TOON before insertion', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-context-json-toon
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - name: payload
      compression:
        heuristic:
          enabled: true
          json_to_toon: true
---

# Prompt template

Payload:
{{ payload }}`,
      variables: {
        payload: '{"users":[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]}',
      },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{
      role: 'user',
      content: [
        'Payload:',
        'users[2]{id,name}:',
        '  1,Alice',
        '  2,Bob',
      ].join('\n'),
    }]);
    expect(result.compression?.[0]).toEqual(expect.objectContaining({
      provider: 'heuristic',
      scope: 'placeholder',
      variable: 'payload',
      outputFormat: 'toon',
    }));
  });

  it('supports opt-in JSON to TOON conversion with a placeholder tag', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-placeholder-toon-tag
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - payload
---

# Prompt template

Payload:
{{ payload | toon }}`,
      variables: {
        payload: '{"orders":[{"id":101,"total":25.5},{"id":102,"total":31}]}',
      },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{
      role: 'user',
      content: [
        'Payload:',
        'orders[2]{id,total}:',
        '  101,25.5',
        '  102,31',
      ].join('\n'),
    }]);
    expect(result.compression?.[0]).toEqual(expect.objectContaining({
      provider: 'heuristic',
      scope: 'placeholder',
      variable: 'payload',
      outputFormat: 'toon',
    }));
  });

  it('warns and preserves placeholder input when TOON tag receives invalid JSON', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-placeholder-toon-invalid
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - payload
---

# Prompt template

Payload: {{ payload | toon }}`,
      variables: {
        payload: '{"orders":[{"id":101}',
      },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: 'Payload: {"orders":[{"id":101}' }]);
    expect(result.compression).toBeUndefined();
    expect(result.warnings).toContain(
      'POK031: JSON-to-TOON skipped for placeholder "payload" because the value is not a complete valid JSON object or array.',
    );
  });

  it('does not sentence-compress invalid JSON when json_to_toon is enabled', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });
    const invalidJson = '{"records":[{"id":1,"body":"Alpha sentence. Beta sentence. Gamma sentence."}';

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: heuristic-json-toon-invalid
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  heuristic:
    enabled: true
    json_to_toon: true
    min_tokens: 1
    max_sentences: 1
---

# Prompt template

${invalidJson}`,
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: invalidJson }]);
    expect(result.compression).toBeUndefined();
    expect(result.warnings).toContain(
      'POK031: JSON-to-TOON skipped because the input is not a complete valid JSON object or array. Scope: prompt template.',
    );
  });
});

describe('code compaction', () => {
  const sourceCode = [
    'function add(a, b) {',
    '  // explain the next line',
    '  const sum = a + b; /* inline detail */',
    '',
    '  return sum;',
    '}',
  ].join('\n');

  const compactedCode = [
    'function add(a, b) {',
    '  const sum = a + b;',
    '  return sum;',
    '}',
  ].join('\n');

  it('compacts a whole prompt template as code without heuristic sentence selection', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: code-prompt-compaction
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  code:
    enabled: true
  heuristic:
    enabled: true
    min_tokens: 1
    max_sentences: 1
---

# Prompt template

${sourceCode}`,
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: compactedCode }]);
    expect(result.compression).toEqual([
      expect.objectContaining({
        provider: 'code',
        scope: 'prompt_template',
        outputFormat: 'code',
      }),
    ]);
  });

  it('compacts configured code context inputs before insertion', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: code-context-compaction
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - name: source
      compression:
        code:
          enabled: true
---

# Prompt template

Code:
{{ source }}`,
      variables: { source: sourceCode },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: `Code:\n${compactedCode}` }]);
    expect(result.compression).toEqual([
      expect.objectContaining({
        provider: 'code',
        scope: 'placeholder',
        variable: 'source',
        outputFormat: 'code',
      }),
    ]);
  });

  it('supports opt-in code compaction with a placeholder tag', async () => {
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: code-placeholder-tag
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - source
---

# Prompt template

Code:
{{ source | compact }}`,
      variables: { source: sourceCode },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(messages).toEqual([{ role: 'user', content: `Code:\n${compactedCode}` }]);
    expect(result.compression?.[0]).toEqual(expect.objectContaining({
      provider: 'code',
      scope: 'placeholder',
      variable: 'source',
      outputFormat: 'code',
    }));
  });

  it('skips backend text compression when prompt-level code compaction is enabled', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const kit = createPromptOpsKit({ sourceDir: '.', cache: false });

    const result = await kit.renderPrompt({
      provider: 'openai',
      source: `---
id: code-no-backend-compression
schema_version: 1
provider: openai
model: gpt-5.4
compression:
  code:
    enabled: true
  thetokencompany:
    enabled: true
---

# Prompt template

${sourceCode}`,
      theTokenCompany: {
        fetch: createCompressionFetch(calls),
      },
    });

    const messages = result.request!.body.messages as Array<{ role: string; content: string }>;
    expect(calls).toHaveLength(0);
    expect(messages).toEqual([{ role: 'user', content: compactedCode }]);
    expect(result.compression).toEqual([
      expect.objectContaining({
        provider: 'code',
        scope: 'prompt_template',
        outputFormat: 'code',
      }),
    ]);
    expect(result.warnings).toContain(
      'POK033: TheTokenCompany compression skipped because compression.code is enabled; code is compacted locally and not text-compressed.',
    );
  });
});
