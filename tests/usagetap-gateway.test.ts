import { describe, expect, it } from 'vitest';
import { PromptAssetSchema } from '../src/schema/index.js';
import { getAdapter } from '../src/providers/index.js';
import {
  createUsageTapGatewayOpenAIConfig,
  USAGETAP_GATEWAY_BASE_URL,
  USAGETAP_GATEWAY_DEFAULT_MODEL,
  usagetapAdapter,
} from '../src/providers/usagetap.js';
import type { ResolvedPromptAsset } from '../src/schema/index.js';

const asset: ResolvedPromptAsset = {
  id: 'gateway', schema_version: 1, provider: 'usagetap',
  sections: { prompt_template: 'Hello' },
};

describe('UsageTap gateway adapter', () => {
  it('is registered and has the documented defaults and OpenAI config', () => {
    expect(PromptAssetSchema.parse(asset).provider).toBe('usagetap');
    expect(getAdapter('usagetap')).toBe(usagetapAdapter);
    expect(USAGETAP_GATEWAY_DEFAULT_MODEL).toBe('usagetap/standard');
    expect(USAGETAP_GATEWAY_BASE_URL).toBe('https://gateway.usagetap.com/v1');
    expect(createUsageTapGatewayOpenAIConfig({ apiKey: 'secret' })).toEqual({
      apiKey: 'secret', baseURL: 'https://gateway.usagetap.com/v1',
    });
  });

  it('requires credentials only when validating/rendering with runtime options', () => {
    expect(usagetapAdapter.validate(asset).valid).toBe(true);
    expect(usagetapAdapter.validate(asset).warnings).toHaveLength(1);
    expect(usagetapAdapter.validate(asset, {}).valid).toBe(false);
    expect(() => usagetapAdapter.render(asset, {})).toThrow(/usagetap\.apiKey/);
  });

  it('renders optional metadata, compression, fallbacks, raw overrides, and headers', () => {
    const result = usagetapAdapter.render({
      ...asset,
      model: 'openai/gpt-5-mini',
      fallback_models: ['openai/gpt-5-mini', 'anthropic/claude-sonnet', 'openai/gpt-4.1'],
      sampling: { max_output_tokens: 321, temperature: 0.4, top_p: 0.8 },
      response: { stream: true, format: 'json', schema: { type: 'object' } },
      tools: [{ name: 'lookup', input_schema: { type: 'object' } }],
      provider_options: { usagetap: {
        customer: { customer_id: 'c1', customer_email: 'billing@example.com', customer_user_name: 'Avery' },
        feature: 'prompt-tightener', conversationId: 'conv', conversationTitle: 'Tools', projectId: 'tools',
        compress: { mode: 'deterministic', aggressiveness: 0.35, failOpen: true },
      } },
      raw: { usagetap: { feature: 'raw-wins', extension: true } },
    }, { usagetap: { apiKey: 'secret', idempotencyKey: 'request-1' } });

    expect(result.provider).toBe('usagetap');
    expect(result.headers).toEqual({ Authorization: 'Bearer secret', 'Idempotency-Key': 'request-1' });
    expect(result.body).toMatchObject({
      model: 'openai/gpt-5-mini', max_completion_tokens: 321, temperature: 0.4, top_p: 0.8,
      models: ['anthropic/claude-sonnet', 'openai/gpt-4.1'], feature: 'raw-wins',
      conversationId: 'conv', conversationTitle: 'Tools', projectId: 'tools', extension: true,
      customer: { customer_id: 'c1', customer_email: 'billing@example.com', customer_user_name: 'Avery' },
      compress: { mode: 'deterministic', aggressiveness: 0.35, failOpen: true },
      stream: true,
    });
    expect(result.body).not.toHaveProperty('max_tokens');
    expect(result.body).not.toHaveProperty('apiKey');
    expect(result.body).not.toHaveProperty('idempotencyKey');
    expect(result.body).not.toHaveProperty('Idempotency-Key');
  });

  it('does not require customer attribution and supports runtime raw merging', () => {
    const result = usagetapAdapter.render(asset, {
      usagetap: { apiKey: 'secret' },
      runtime: { raw: { usagetap: { route: 'runtime' } } },
    });
    expect(result.model).toBe('usagetap/standard');
    expect(result.body).toMatchObject({ model: 'usagetap/standard', route: 'runtime' });
    expect(result.body).not.toHaveProperty('customer');
  });

  it('renders an inline source through prompt input support', async () => {
    const result = await usagetapAdapter.renderPrompt({ source: `---\nid: inline\nprovider: usagetap\n---\n# Prompt template\nHi` }, {
      usagetap: { apiKey: 'secret' },
    });
    expect(result.provider).toBe('usagetap');
  });
});
