import type { ProviderRequest } from '../providers/types.js';
import { defaultUsageTapErrorMapper, withUsageTapCall } from './lifecycle.js';
import type {
  UsageTapAllowed,
  UsageTapAllowedCapability,
  UsageTapBeginResponse,
  UsageTapClient,
  UsageTapEndUsage,
  UsageTapEntitlementOptions,
  UsageTapProviderRunOptions,
  UsageTapProviderRunResult,
  UsageTapReasoningLevel,
} from './types.js';

function cloneRequest(request: ProviderRequest): ProviderRequest {
  return structuredClone(request);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((item) => isObject(item));
}

function isInvokeResult<TResult>(value: unknown): value is { result: TResult; usage: UsageTapEndUsage } {
  return isObject(value) && 'result' in value && 'usage' in value;
}

function capabilityAllowed(allowed: UsageTapAllowed, capability: UsageTapAllowedCapability): boolean {
  return allowed[capability] !== false;
}

function reasoningLevelOrder(level: UsageTapReasoningLevel | undefined): number {
  switch (level) {
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
    default:
      return 0;
  }
}

function capOpenAIReasoning(body: Record<string, unknown>, allowed: UsageTapAllowed): void {
  if (typeof body.reasoning_effort !== 'string') {
    return;
  }

  const current = String(body.reasoning_effort).toUpperCase() as UsageTapReasoningLevel;
  const allowedLevel = allowed.reasoningLevel ?? 'HIGH';

  if (allowedLevel === 'NONE') {
    delete body.reasoning_effort;
    return;
  }

  if (reasoningLevelOrder(current) > reasoningLevelOrder(allowedLevel)) {
    body.reasoning_effort = allowedLevel.toLowerCase();
  }
}

function capGeminiReasoning(body: Record<string, unknown>, allowed: UsageTapAllowed): void {
  if (allowed.reasoningLevel === 'NONE') {
    delete body.thinkingConfig;
    return;
  }

  const budgets: Record<Exclude<UsageTapReasoningLevel, 'NONE'>, number> = {
    LOW: 1024,
    MEDIUM: 4096,
    HIGH: 8192,
  };

  const allowedBudget = allowed.reasoningLevel ? budgets[allowed.reasoningLevel as Exclude<UsageTapReasoningLevel, 'NONE'>] : undefined;

  if (allowedBudget === undefined) {
    return;
  }

  if (!isObject(body.thinkingConfig)) {
    body.thinkingConfig = { thinkingBudget: allowedBudget };
    return;
  }

  const thinkingConfig = body.thinkingConfig;

  if (typeof thinkingConfig.thinkingBudget === 'number') {
    thinkingConfig.thinkingBudget = Math.min(thinkingConfig.thinkingBudget, allowedBudget);
    return;
  }

  thinkingConfig.thinkingBudget = allowedBudget;
}

function applyModelTier(request: ProviderRequest, allowed: UsageTapAllowed, options: UsageTapEntitlementOptions): void {
  const nextModel = allowed.premium && options.modelTiers?.premium
    ? options.modelTiers.premium
    : allowed.standard && options.modelTiers?.standard
      ? options.modelTiers.standard
      : undefined;

  if (!nextModel) {
    return;
  }

  request.model = nextModel;
  if (isObject(request.body) && 'model' in request.body) {
    request.body.model = nextModel;
  }
}

function filterOpenAITools(tools: Array<Record<string, unknown>>, allowed: UsageTapAllowed, options: UsageTapEntitlementOptions): Array<Record<string, unknown>> {
  return tools.filter((tool) => {
    if (tool.type === 'web_search' && allowed.search === false) {
      return false;
    }

    const functionDef = isObject(tool.function) ? tool.function : undefined;
    const name = typeof functionDef?.name === 'string'
      ? functionDef.name
      : typeof tool.name === 'string'
        ? tool.name
        : typeof tool.type === 'string'
          ? tool.type
          : undefined;

    if (!name) {
      return true;
    }

    const capability = options.toolEntitlements?.[name];
    return capability ? capabilityAllowed(allowed, capability) : true;
  });
}

function filterAnthropicTools(tools: Array<Record<string, unknown>>, allowed: UsageTapAllowed, options: UsageTapEntitlementOptions): Array<Record<string, unknown>> {
  return tools.filter((tool) => {
    const name = typeof tool.name === 'string' ? tool.name : undefined;
    if (!name) {
      return true;
    }
    const capability = options.toolEntitlements?.[name];
    return capability ? capabilityAllowed(allowed, capability) : true;
  });
}

function filterGeminiTools(tools: Array<Record<string, unknown>>, allowed: UsageTapAllowed, options: UsageTapEntitlementOptions): Array<Record<string, unknown>> {
  return tools
    .map((tool) => {
      const declarations = Array.isArray(tool.functionDeclarations)
        ? tool.functionDeclarations.filter((declaration) => {
          if (!isObject(declaration) || typeof declaration.name !== 'string') {
            return true;
          }
          const capability = options.toolEntitlements?.[declaration.name];
          return capability ? capabilityAllowed(allowed, capability) : true;
        })
        : tool.functionDeclarations;

      return {
        ...tool,
        functionDeclarations: declarations,
      };
    })
    .filter((tool) => {
      if (!Array.isArray(tool.functionDeclarations)) {
        return true;
      }
      return tool.functionDeclarations.length > 0;
    });
}

export function applyUsageTapEntitlements(
  request: ProviderRequest,
  begin: UsageTapBeginResponse,
  options: UsageTapEntitlementOptions = {},
): ProviderRequest {
  const nextRequest = cloneRequest(request);
  const allowed = begin.data.allowed ?? {};

  applyModelTier(nextRequest, allowed, options);

  if (!isObject(nextRequest.body)) {
    return nextRequest;
  }

  if (nextRequest.provider === 'openai' || nextRequest.provider === 'openrouter') {
    capOpenAIReasoning(nextRequest.body, allowed);
    if (isRecordArray(nextRequest.body.tools)) {
      nextRequest.body.tools = filterOpenAITools(nextRequest.body.tools, allowed, options);
    }
    return nextRequest;
  }

  if (nextRequest.provider === 'gemini') {
    capGeminiReasoning(nextRequest.body, allowed);
    if (isRecordArray(nextRequest.body.tools)) {
      nextRequest.body.tools = filterGeminiTools(nextRequest.body.tools, allowed, options);
    }
    return nextRequest;
  }

  if (nextRequest.provider === 'anthropic' && isRecordArray(nextRequest.body.tools)) {
    nextRequest.body.tools = filterAnthropicTools(nextRequest.body.tools, allowed, options);
  }

  return nextRequest;
}

interface UsageMeta {
  modelUsed?: string;
  responseStatusCode?: number;
}

export function extractOpenAIUsage(response: unknown, meta: UsageMeta = {}): UsageTapEndUsage {
  const usage = isObject(response) && isObject(response.usage) ? response.usage : {};
  const promptDetails = isObject(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const completionDetails = isObject(usage.completion_tokens_details) ? usage.completion_tokens_details : {};

  return {
    modelUsed: meta.modelUsed,
    inputTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0,
    responseTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0,
    cachedInputTokens: typeof promptDetails.cached_tokens === 'number' ? promptDetails.cached_tokens : undefined,
    reasoningTokens: typeof completionDetails.reasoning_tokens === 'number' ? completionDetails.reasoning_tokens : undefined,
    responseStatusCode: meta.responseStatusCode ?? 200,
  };
}

export function extractAnthropicUsage(response: unknown, meta: UsageMeta = {}): UsageTapEndUsage {
  const usage = isObject(response) && isObject(response.usage) ? response.usage : {};

  return {
    modelUsed: meta.modelUsed,
    inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
    responseTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
    cachedInputTokens: typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : undefined,
    responseStatusCode: meta.responseStatusCode ?? 200,
  };
}

export function extractGeminiUsage(response: unknown, meta: UsageMeta = {}): UsageTapEndUsage {
  const usage = isObject(response) && isObject(response.usageMetadata) ? response.usageMetadata : {};

  return {
    modelUsed: meta.modelUsed,
    inputTokens: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : 0,
    responseTokens: typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0,
    cachedInputTokens: typeof usage.cachedContentTokenCount === 'number' ? usage.cachedContentTokenCount : undefined,
    reasoningTokens: typeof usage.thoughtsTokenCount === 'number' ? usage.thoughtsTokenCount : undefined,
    responseStatusCode: meta.responseStatusCode ?? 200,
  };
}

async function runProviderWithUsageTap<TResult>(
  client: UsageTapClient,
  options: UsageTapProviderRunOptions<TResult>,
  defaultExtractor: (response: TResult, meta: UsageMeta) => UsageTapEndUsage,
): Promise<UsageTapProviderRunResult<TResult>> {
  let requestUsed = cloneRequest(options.request);

  const lifecycle = await withUsageTapCall(client, {
    begin: options.begin,
    signal: options.signal,
    onError: options.onError ?? defaultUsageTapErrorMapper,
    invoke: async ({ begin, setUsage }) => {
      requestUsed = options.entitlementMode === 'apply'
        ? applyUsageTapEntitlements(options.request, begin, options)
        : cloneRequest(options.request);

      const invoked = await options.invoke(requestUsed);

      if (isInvokeResult<TResult>(invoked)) {
        return invoked;
      }

      const response = invoked as TResult;
      const usage = (options.extractUsage ?? defaultExtractor)(response, {
        modelUsed: requestUsed.model,
        responseStatusCode: 200,
      });
      setUsage(usage);
      return response;
    },
  });

  return {
    response: lifecycle.result,
    begin: lifecycle.begin,
    end: lifecycle.end,
    requestUsed,
    effectiveUsage: lifecycle.effectiveUsage,
    allowed: lifecycle.begin.data.allowed ?? {},
  };
}

export function runOpenAIWithUsageTap<TResult>(client: UsageTapClient, options: UsageTapProviderRunOptions<TResult>) {
  return runProviderWithUsageTap(client, options, extractOpenAIUsage);
}

export function runOpenRouterWithUsageTap<TResult>(client: UsageTapClient, options: UsageTapProviderRunOptions<TResult>) {
  return runProviderWithUsageTap(client, options, extractOpenAIUsage);
}

export function runAnthropicWithUsageTap<TResult>(client: UsageTapClient, options: UsageTapProviderRunOptions<TResult>) {
  return runProviderWithUsageTap(client, options, extractAnthropicUsage);
}

export function runGeminiWithUsageTap<TResult>(client: UsageTapClient, options: UsageTapProviderRunOptions<TResult>) {
  return runProviderWithUsageTap(client, options, extractGeminiUsage);
}
