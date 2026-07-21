import { describe, expect, it, vi } from 'vitest';
import type { ProviderRequest } from '../src/providers/types.js';
import {
  applyUsageTapEntitlements,
  createUsageTapClient,
  extractAnthropicUsage,
  extractGeminiUsage,
  extractOpenAIUsage,
  runAnthropicWithUsageTap,
  runGeminiWithUsageTap,
  runLLMAsAServiceWithUsageTap,
  runOpenAIWithUsageTap,
  withUsageTapCall,
} from '../src/usagetap/index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('UsageTap client', () => {
  it('sends canonical headers and bearer auth', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { callId: 'call_1', allowed: {} } }));
    const client = createUsageTapClient({
      apiKey: 'secret-key',
      baseUrl: 'https://api.example.com/',
      fetch: fetchMock as typeof fetch,
    });

    await client.beginCall({
      customerId: 'customer-1',
      feature: 'chat.send',
      idempotencyKey: 'idempotent-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/call_begin',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer secret-key',
          Accept: 'application/vnd.usagetap.v1+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: 'customer-1',
          feature: 'chat.send',
          idempotencyKey: 'idempotent-1',
        }),
      }),
    );
  });
});

describe('withUsageTapCall', () => {
  it('finalizes successful calls and supports setUsage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { callId: 'call_1', allowed: {} } }))
      .mockResolvedValueOnce(jsonResponse({ data: { costUSD: 0.12 } }));

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });

    const result = await withUsageTapCall(client, {
      begin: { customerId: 'customer-1', feature: 'chat.send' },
      invoke: async ({ setUsage }) => {
        setUsage({
          modelUsed: 'gpt-5.4-mini',
          inputTokens: 11,
          responseTokens: 17,
        });
        return { ok: true };
      },
    });

    expect(result.result).toEqual({ ok: true });
    expect(result.effectiveUsage).toMatchObject({
      modelUsed: 'gpt-5.4-mini',
      inputTokens: 11,
      responseTokens: 17,
      responseStatusCode: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.usagetap.com/call_end');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      callId: 'call_1',
      modelUsed: 'gpt-5.4-mini',
      inputTokens: 11,
      responseTokens: 17,
      responseStatusCode: 200,
    });
  });

  it('finalizes failed calls on abort and records vendor errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { callId: 'call_2', allowed: {} } }))
      .mockResolvedValueOnce(jsonResponse({ data: { costUSD: 0 } }));

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });
    const controller = new AbortController();
    const error = Object.assign(new Error('aborted'), { status: 499, name: 'AbortError' });

    await expect(
      withUsageTapCall(client, {
        begin: { customerId: 'customer-2', feature: 'chat.send' },
        signal: controller.signal,
        invoke: async ({ signal }) => {
          expect(signal?.aborted).toBe(false);
          controller.abort();
          throw error;
        },
      }),
    ).rejects.toThrow('aborted');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      callId: 'call_2',
      responseStatusCode: 499,
      error: {
        code: 'VENDOR_ERROR',
        message: 'AbortError: aborted',
      },
    });
  });

  it('accepts invoke results that return usage directly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { callId: 'call_3', allowed: {} } }))
      .mockResolvedValueOnce(jsonResponse({ data: { costUSD: 0.42 } }));

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });

    const result = await withUsageTapCall(client, {
      begin: { customerId: 'customer-3' },
      invoke: async () => ({
        result: { ok: true },
        usage: {
          modelUsed: 'gpt-5.4',
          inputTokens: 101,
          responseTokens: 202,
        },
      }),
    });

    expect(result.result).toEqual({ ok: true });
    expect(result.effectiveUsage).toMatchObject({
      modelUsed: 'gpt-5.4',
      inputTokens: 101,
      responseTokens: 202,
      responseStatusCode: 200,
    });
  });

  it('preserves the vendor error and attaches the UsageTap end failure as cause', async () => {
    const endError = new Error('UsageTap end failed');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { callId: 'call_5', allowed: {} } }))
      .mockRejectedValueOnce(endError);

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });
    const vendorError = new Error('vendor failed');

    await expect(
      withUsageTapCall(client, {
        begin: { customerId: 'customer-5', feature: 'chat.send' },
        invoke: async () => {
          throw vendorError;
        },
      }),
    ).rejects.toBe(vendorError);

    expect(vendorError.cause).toBe(endError);
  });
});

describe('UsageTap extractors', () => {
  it('maps OpenAI usage fields', () => {
    expect(
      extractOpenAIUsage(
        {
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            prompt_tokens_details: { cached_tokens: 3 },
            completion_tokens_details: { reasoning_tokens: 4 },
          },
        },
        { modelUsed: 'gpt-5.4-mini' },
      ),
    ).toEqual({
      modelUsed: 'gpt-5.4-mini',
      inputTokens: 10,
      responseTokens: 20,
      cachedInputTokens: 3,
      reasoningTokens: 4,
      responseStatusCode: 200,
    });
  });

  it('maps Anthropic usage fields', () => {
    expect(
      extractAnthropicUsage(
        {
          usage: {
            input_tokens: 12,
            output_tokens: 34,
            cache_read_input_tokens: 5,
          },
        },
        { modelUsed: 'claude-sonnet-4-6' },
      ),
    ).toEqual({
      modelUsed: 'claude-sonnet-4-6',
      inputTokens: 12,
      responseTokens: 34,
      cachedInputTokens: 5,
      responseStatusCode: 200,
    });
  });

  it('maps Gemini usage fields', () => {
    expect(
      extractGeminiUsage(
        {
          usageMetadata: {
            promptTokenCount: 9,
            candidatesTokenCount: 18,
            cachedContentTokenCount: 2,
            thoughtsTokenCount: 1,
          },
        },
        { modelUsed: 'gemini-2.5-flash' },
      ),
    ).toEqual({
      modelUsed: 'gemini-2.5-flash',
      inputTokens: 9,
      responseTokens: 18,
      cachedInputTokens: 2,
      reasoningTokens: 1,
      responseStatusCode: 200,
    });
  });
});

describe('UsageTap entitlement helpers', () => {
  it('returns a cloned request with tier, reasoning, and tool gating applied', () => {
    const original: ProviderRequest = {
      provider: 'openai',
      model: 'gpt-5.4',
      body: {
        model: 'gpt-5.4',
        reasoning_effort: 'high',
        tools: [
          { type: 'web_search' },
          { type: 'function', function: { name: 'image_tool' } },
          { type: 'function', function: { name: 'search_tool' } },
        ],
      },
    };

    const next = applyUsageTapEntitlements(
      original,
      {
        data: {
          callId: 'call_1',
          allowed: {
            standard: true,
            premium: false,
            search: false,
            image: false,
            reasoningLevel: 'LOW',
          },
        },
      },
      {
        modelTiers: {
          standard: 'gpt-5.4-mini',
          premium: 'gpt-5.4',
        },
        toolEntitlements: {
          image_tool: 'image',
          search_tool: 'search',
        },
      },
    );

    expect(next).not.toBe(original);
    expect(next.model).toBe('gpt-5.4-mini');
    expect(next.body.model).toBe('gpt-5.4-mini');
    expect(next.body.reasoning_effort).toBe('low');
    expect(next.body.tools).toEqual([]);
    expect(original.body.model).toBe('gpt-5.4');
    expect(original.body.reasoning_effort).toBe('high');
    expect(original.body.tools).toHaveLength(3);
  });

  it('sets a Gemini thinking budget when reasoning is allowed but the request omitted one', () => {
    const next = applyUsageTapEntitlements(
      {
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        body: {
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        },
      },
      {
        data: {
          callId: 'call_6',
          allowed: {
            reasoningLevel: 'LOW',
          },
        },
      },
    );

    expect(next.body.thinkingConfig).toEqual({ thinkingBudget: 1024 });
  });

  it('applies OpenAI-compatible entitlement rules to LLMAsAService requests', () => {
    const next = applyUsageTapEntitlements(
      {
        provider: 'llmasaservice',
        model: 'openai:gpt-5.2',
        body: {
          model: 'openai:gpt-5.2',
          reasoning_effort: 'high',
          tools: [{ type: 'web_search' }],
        },
        headers: { Authorization: 'Bearer gateway-key' },
      },
      {
        data: {
          callId: 'call_gateway',
          allowed: {
            standard: true,
            premium: false,
            search: false,
            reasoningLevel: 'LOW',
          },
        },
      },
      {
        modelTiers: {
          standard: 'group:standard',
        },
      },
    );

    expect(next.model).toBe('group:standard');
    expect(next.body.model).toBe('group:standard');
    expect(next.body.reasoning_effort).toBe('low');
    expect(next.body.tools).toEqual([]);
    expect(next.headers).toEqual({ Authorization: 'Bearer gateway-key' });
  });
});

describe('runOpenAIWithUsageTap', () => {
  it('applies entitlements, extracts usage, and returns effective usage metadata', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          callId: 'call_4',
          allowed: {
            standard: true,
            premium: false,
            search: false,
            audio: true,
            image: false,
            reasoningLevel: 'LOW',
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: { costUSD: 0.08 } }));

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });
    const request: ProviderRequest = {
      provider: 'openai',
      model: 'gpt-5.4',
      body: {
        model: 'gpt-5.4',
        reasoning_effort: 'high',
        tools: [{ type: 'web_search' }],
        messages: [{ role: 'user', content: 'Hello' }],
      },
    };

    const result = await runOpenAIWithUsageTap(client, {
      begin: { customerId: 'customer-4', feature: 'chat.send' },
      request,
      entitlementMode: 'apply',
      modelTiers: {
        standard: 'gpt-5.4-mini',
        premium: 'gpt-5.4',
      },
      invoke: async (requestUsed) => {
        expect(requestUsed.model).toBe('gpt-5.4-mini');
        expect(requestUsed.body.model).toBe('gpt-5.4-mini');
        expect(requestUsed.body.reasoning_effort).toBe('low');
        expect(requestUsed.body.tools).toEqual([]);
        return {
          usage: {
            prompt_tokens: 14,
            completion_tokens: 6,
            prompt_tokens_details: { cached_tokens: 2 },
          },
        };
      },
    });

    expect(result.allowed).toMatchObject({
      audio: true,
      image: false,
      search: false,
    });
    expect(result.effectiveUsage).toMatchObject({
      modelUsed: 'gpt-5.4-mini',
      inputTokens: 14,
      responseTokens: 6,
      cachedInputTokens: 2,
      responseStatusCode: 200,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('leaves the request unchanged when entitlementMode is off', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          callId: 'call_7',
          allowed: {
            standard: true,
            premium: false,
            search: false,
            reasoningLevel: 'LOW',
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: { costUSD: 0.01 } }));

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });
    const request: ProviderRequest = {
      provider: 'openai',
      model: 'gpt-5.4',
      body: {
        model: 'gpt-5.4',
        reasoning_effort: 'high',
        tools: [{ type: 'web_search' }],
      },
    };

    const result = await runOpenAIWithUsageTap(client, {
      begin: { customerId: 'customer-7', feature: 'chat.send' },
      request,
      invoke: async (requestUsed) => {
        expect(requestUsed).not.toBe(request);
        expect(requestUsed.model).toBe('gpt-5.4');
        expect(requestUsed.body.model).toBe('gpt-5.4');
        expect(requestUsed.body.reasoning_effort).toBe('high');
        expect(requestUsed.body.tools).toEqual([{ type: 'web_search' }]);
        return {
          usage: {
            prompt_tokens: 3,
            completion_tokens: 4,
          },
        };
      },
    });

    expect(result.requestUsed.body.reasoning_effort).toBe('high');
    expect(result.requestUsed.body.tools).toEqual([{ type: 'web_search' }]);
  });
});

describe('other UsageTap provider runners', () => {
  it('runs LLMAsAService tracking with the OpenAI-compatible extractor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { callId: 'call_gateway', allowed: {} } }))
      .mockResolvedValueOnce(jsonResponse({ data: { costUSD: 0.02 } }));

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });

    const result = await runLLMAsAServiceWithUsageTap(client, {
      begin: { customerId: 'customer-gateway', feature: 'chat.send' },
      request: {
        provider: 'llmasaservice',
        model: 'group:standard',
        body: {
          model: 'group:standard',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      },
      invoke: async () => ({
        usage: {
          prompt_tokens: 12,
          completion_tokens: 9,
          prompt_tokens_details: { cached_tokens: 2 },
        },
      }),
    });

    expect(result.effectiveUsage).toMatchObject({
      modelUsed: 'group:standard',
      inputTokens: 12,
      responseTokens: 9,
      cachedInputTokens: 2,
      responseStatusCode: 200,
    });
  });

  it('runs Anthropic tracking with the Anthropic extractor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { callId: 'call_8', allowed: {} } }))
      .mockResolvedValueOnce(jsonResponse({ data: { costUSD: 0.02 } }));

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });

    const result = await runAnthropicWithUsageTap(client, {
      begin: { customerId: 'customer-8', feature: 'chat.send' },
      request: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        body: {
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      },
      invoke: async () => ({
        usage: {
          input_tokens: 12,
          output_tokens: 9,
          cache_read_input_tokens: 2,
        },
      }),
    });

    expect(result.effectiveUsage).toMatchObject({
      modelUsed: 'claude-sonnet-4-20250514',
      inputTokens: 12,
      responseTokens: 9,
      cachedInputTokens: 2,
      responseStatusCode: 200,
    });
  });

  it('runs Gemini tracking with the Gemini extractor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { callId: 'call_9', allowed: {} } }))
      .mockResolvedValueOnce(jsonResponse({ data: { costUSD: 0.03 } }));

    const client = createUsageTapClient({ apiKey: 'secret-key', fetch: fetchMock as typeof fetch });

    const result = await runGeminiWithUsageTap(client, {
      begin: { customerId: 'customer-9', feature: 'chat.send' },
      request: {
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        body: {
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        },
      },
      invoke: async () => ({
        usageMetadata: {
          promptTokenCount: 7,
          candidatesTokenCount: 5,
          cachedContentTokenCount: 1,
          thoughtsTokenCount: 2,
        },
      }),
    });

    expect(result.effectiveUsage).toMatchObject({
      modelUsed: 'gemini-2.5-pro',
      inputTokens: 7,
      responseTokens: 5,
      cachedInputTokens: 1,
      reasoningTokens: 2,
      responseStatusCode: 200,
    });
  });
});
