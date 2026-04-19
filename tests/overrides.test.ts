import { describe, it, expect } from 'vitest';
import { applyOverrides } from '../src/overrides/apply-overrides.js';
import type { PromptAsset } from '../src/schema/index.js';

describe('applyOverrides', () => {
  const base: PromptAsset = {
    id: 'test',
    schema_version: 1,
    provider: 'openai',
    model: 'gpt-5.4',
    sampling: { temperature: 0.7 },
    environments: {
      dev: { model: 'gpt-5.4-mini', sampling: { temperature: 0.2 } },
      prod: { model: 'gpt-5.4' },
    },
    tiers: {
      free: { model: 'gpt-5.4-mini' },
      pro: { model: 'gpt-5.4' },
    },
  };

  it('returns base when no overrides', () => {
    const result = applyOverrides(base);
    expect(result.model).toBe('gpt-5.4');
  });

  it('applies environment override', () => {
    const result = applyOverrides(base, { environment: 'dev' });
    expect(result.model).toBe('gpt-5.4-mini');
    expect(result.sampling?.temperature).toBe(0.2);
  });

  it('applies tier override after environment', () => {
    const result = applyOverrides(base, { environment: 'dev', tier: 'pro' });
    // tier overrides environment
    expect(result.model).toBe('gpt-5.4');
  });

  it('applies runtime overrides last', () => {
    const result = applyOverrides(base, {
      environment: 'prod',
      tier: 'pro',
      runtime: { model: 'gpt-6' },
    });
    expect(result.model).toBe('gpt-6');
  });

  it('ignores unknown environment', () => {
    const result = applyOverrides(base, { environment: 'staging' });
    expect(result.model).toBe('gpt-5.4');
  });
});
