import { resolveInlinePromptSource, resolvePromptAsset } from '../prompt-resolution.js';
import type { ResolvedPromptAsset } from '../schema/index.js';
import type {
  ProviderAdapter,
  ProviderPromptInput,
  RenderPromptMethod,
  RuntimeRenderOptions,
  ValidatePromptMethod,
} from './types.js';

type SyncProviderAdapter = Omit<ProviderAdapter, 'validatePrompt' | 'renderPrompt'>;

function isPromptLookup(input: ProviderPromptInput): input is Extract<ProviderPromptInput, { path: string }> {
  return 'path' in input && typeof input.path === 'string';
}

function isInlinePromptSource(input: ProviderPromptInput): input is Extract<ProviderPromptInput, { source: string }> {
  return 'source' in input && typeof input.source === 'string';
}

async function resolveProviderPromptInput(
  input: ProviderPromptInput,
  runtime?: Pick<RuntimeRenderOptions, 'environment' | 'tier' | 'runtime'>,
): Promise<ResolvedPromptAsset> {
  if (isPromptLookup(input)) {
    return resolvePromptAsset(input.path, input, runtime);
  }

  if (isInlinePromptSource(input)) {
    return resolveInlinePromptSource(input.source, runtime);
  }

  return input;
}

export function withPromptInputSupport(adapter: SyncProviderAdapter): ProviderAdapter {
  const validatePrompt: ValidatePromptMethod = async (input, runtime) => {
    const resolved = await resolveProviderPromptInput(input, runtime);
    return adapter.validate(resolved, runtime);
  };

  const renderPrompt: RenderPromptMethod = async (input, runtime) => {
    const resolved = await resolveProviderPromptInput(input, runtime);
    return adapter.render(resolved, runtime);
  };

  return {
    ...adapter,
    validatePrompt,
    renderPrompt,
  };
}