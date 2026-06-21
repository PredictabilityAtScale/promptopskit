import { resolveInlinePromptSource, resolvePromptAsset } from '../prompt-resolution.js';
import type { ResolvedPromptAsset } from '../schema/index.js';
import { sanitizeContextVariables } from '../context.js';
import { compactHistoryForPrompt } from '../history.js';
import { applyPromptCompressionForRender, summarizePromptCompression } from '../compression.js';
import { resolveAssetForProvider } from './resolve-asset.js';
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
    const resolvedForRender = resolveAssetForProvider(resolved, runtime);
    const sanitization = sanitizeContextVariables(resolvedForRender, runtime.variables, {
      onContextOverflow: runtime.onContextOverflow,
    });

    if (sanitization.shortCircuit) {
      return {
        provider: adapter.name,
        model: resolvedForRender.model ?? '',
        returnMessage: sanitization.shortCircuit.returnMessage,
      };
    }

    const prepared = await applyPromptCompressionForRender(resolvedForRender, {
      ...runtime,
      environment: undefined,
      tier: undefined,
      runtime: undefined,
      variables: sanitization.variables,
      history: compactHistoryForPrompt(resolvedForRender, runtime),
    });
    const request = adapter.render(prepared.asset, prepared.runtime);

    return prepared.compression.length > 0 || prepared.warnings.length > 0
      ? {
        ...request,
        ...(prepared.compression.length > 0
          ? {
            compression: prepared.compression,
            compressionSummary: summarizePromptCompression(prepared.compression),
          }
          : {}),
        ...(prepared.warnings.length > 0 ? { warnings: prepared.warnings } : {}),
      }
      : request;
  };

  return {
    ...adapter,
    validatePrompt,
    renderPrompt,
  };
}
