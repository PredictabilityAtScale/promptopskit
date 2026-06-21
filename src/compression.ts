import type { ResolvedPromptAsset } from './schema/index.js';
import { renderSections } from './renderer/index.js';
import type { RuntimeRenderOptions } from './providers/types.js';

export const THETOKENCOMPANY_DEFAULT_MODEL = 'bear-2';
export const THETOKENCOMPANY_DEFAULT_BASE_URL = 'https://api.thetokencompany.com';

export interface TheTokenCompanyRuntimeOptions {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof fetch;
}

export interface PromptCompressionResult {
  provider: 'thetokencompany';
  model: string;
  inputTokens: number;
  outputTokens: number;
  tokensSaved: number;
  compressionRatio: number;
}

export interface PromptCompressionRenderResult {
  asset: ResolvedPromptAsset;
  runtime: RuntimeRenderOptions;
  compression: PromptCompressionResult[];
}

interface TheTokenCompanyCompressResponse {
  output: string;
  output_tokens: number;
  input_tokens: number;
  tokens_saved: number;
  compression_ratio: number;
}

export async function applyPromptCompressionForRender(
  asset: ResolvedPromptAsset,
  runtime: RuntimeRenderOptions,
): Promise<PromptCompressionRenderResult> {
  const config = asset.compression?.thetokencompany;

  if (config?.enabled !== true || !asset.sections.prompt_template) {
    return { asset, runtime, compression: [] };
  }

  const sections = renderSections(asset, {
    variables: runtime.variables,
    strict: runtime.strict,
  });

  if (!sections.prompt_template) {
    return { asset, runtime, compression: [] };
  }

  const model = config.model ?? THETOKENCOMPANY_DEFAULT_MODEL;
  const result = await compressWithTheTokenCompany(sections.prompt_template, {
    apiKey: runtime.theTokenCompany?.apiKey,
    baseURL: runtime.theTokenCompany?.baseURL,
    fetch: runtime.theTokenCompany?.fetch,
    model,
    aggressiveness: config.aggressiveness,
  });

  return {
    asset: {
      ...asset,
      sections: {
        ...asset.sections,
        ...sections,
        prompt_template: result.output,
      },
    },
    runtime: {
      ...runtime,
      variables: {},
      strict: false,
    },
    compression: [{
      provider: 'thetokencompany',
      model,
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
      tokensSaved: result.tokens_saved,
      compressionRatio: result.compression_ratio,
    }],
  };
}

async function compressWithTheTokenCompany(
  input: string,
  options: {
    apiKey?: string;
    baseURL?: string;
    fetch?: typeof fetch;
    model: string;
    aggressiveness?: number;
  },
): Promise<TheTokenCompanyCompressResponse> {
  const apiKey = options.apiKey ?? getEnv('THETOKENCOMPANY_API_KEY') ?? getEnv('TTC_API_KEY');
  if (!apiKey) {
    throw new Error(
      'TheTokenCompany compression is enabled, but no API key was provided. '
      + 'Pass theTokenCompany.apiKey to renderPrompt() or set THETOKENCOMPANY_API_KEY.',
    );
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('TheTokenCompany compression requires a runtime with fetch support.');
  }

  const baseURL = (options.baseURL ?? THETOKENCOMPANY_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const compressionSettings = options.aggressiveness === undefined
    ? undefined
    : { aggressiveness: options.aggressiveness };

  const response = await fetchImpl(`${baseURL}/v1/compress`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      input,
      ...(compressionSettings ? { compression_settings: compressionSettings } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `TheTokenCompany compression failed with HTTP ${response.status}`
      + (body ? `: ${body}` : '.'),
    );
  }

  const data = await response.json() as Partial<TheTokenCompanyCompressResponse>;
  if (
    typeof data.output !== 'string'
    || typeof data.output_tokens !== 'number'
    || typeof data.input_tokens !== 'number'
    || typeof data.tokens_saved !== 'number'
    || typeof data.compression_ratio !== 'number'
  ) {
    throw new Error('TheTokenCompany compression returned an invalid response payload.');
  }

  return data as TheTokenCompanyCompressResponse;
}

function getEnv(name: string): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return process.env[name];
}
