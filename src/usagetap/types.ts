import type { ProviderRequest } from '../providers/types.js';

export type UsageTapReasoningLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type UsageTapEntitlementMode = 'off' | 'apply';
export type UsageTapAllowedCapability = 'standard' | 'premium' | 'audio' | 'image' | 'search';

export interface UsageTapAllowed {
  standard?: boolean;
  premium?: boolean;
  audio?: boolean;
  image?: boolean;
  search?: boolean;
  reasoningLevel?: UsageTapReasoningLevel;
}

export interface UsageTapBeginRequest {
  customerId: string;
  feature?: string;
  tags?: string[];
  customerName?: string;
  customerEmail?: string;
  stripeCustomerId?: string;
  requested?: Record<string, boolean | string>;
  idempotencyKey?: string;
  batch?: boolean;
  pricingMode?: 'batch' | 'standard';
}

export interface UsageTapBeginResponse {
  data: {
    callId: string;
    allowed: UsageTapAllowed;
    entitlementHints?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    plan?: Record<string, unknown>;
    balances?: Record<string, unknown>;
    stripeCustomerId?: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface UsageTapErrorPayload {
  code: string;
  message: string;
}

export interface UsageTapEndUsage {
  modelUsed?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  responseTokens?: number;
  reasoningTokens?: number;
  searches?: number;
  audio?: number;
  audioSeconds?: number;
  isPremium?: boolean;
  stripeCustomerId?: string;
  responseStatusCode?: number;
  batch?: boolean;
  pricingMode?: 'batch' | 'standard';
  error?: UsageTapErrorPayload;
}

export interface UsageTapEndRequest extends UsageTapEndUsage {
  callId: string;
}

export interface UsageTapEndResponse {
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageTapClientConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export interface UsageTapRequestInit {
  signal?: AbortSignal;
}

export interface UsageTapClient {
  request<T>(path: string, body: unknown, init?: UsageTapRequestInit): Promise<T>;
  beginCall(begin: UsageTapBeginRequest, init?: UsageTapRequestInit): Promise<UsageTapBeginResponse>;
  endCall(end: UsageTapEndRequest, init?: UsageTapRequestInit): Promise<UsageTapEndResponse>;
}

export interface UsageTapInvokeContext {
  begin: UsageTapBeginResponse;
  setUsage: (usage: UsageTapEndUsage) => void;
  signal?: AbortSignal;
}

export interface UsageTapInvokeResult<TResult> {
  result: TResult;
  usage: UsageTapEndUsage;
}

export interface UsageTapCallOptions<TResult> {
  begin: UsageTapBeginRequest;
  invoke: (context: UsageTapInvokeContext) => Promise<TResult | UsageTapInvokeResult<TResult>>;
  onError?: (error: unknown) => UsageTapErrorPayload;
  signal?: AbortSignal;
}

export interface UsageTapCallResult<TResult> {
  result: TResult;
  begin: UsageTapBeginResponse;
  end: UsageTapEndResponse;
  effectiveUsage: UsageTapEndUsage;
}

export interface UsageTapEntitlementOptions {
  modelTiers?: {
    standard?: string;
    premium?: string;
  };
  toolEntitlements?: Record<string, UsageTapAllowedCapability>;
}

export interface UsageTapProviderRunOptions<TResult> extends UsageTapEntitlementOptions {
  request: ProviderRequest;
  begin: UsageTapBeginRequest;
  invoke: (request: ProviderRequest) => Promise<TResult | UsageTapInvokeResult<TResult>>;
  extractUsage?: (response: TResult) => UsageTapEndUsage;
  entitlementMode?: UsageTapEntitlementMode;
  signal?: AbortSignal;
  onError?: (error: unknown) => UsageTapErrorPayload;
}

export interface UsageTapProviderRunResult<TResult> {
  response: TResult;
  begin: UsageTapBeginResponse;
  end: UsageTapEndResponse;
  requestUsed: ProviderRequest;
  effectiveUsage: UsageTapEndUsage;
  allowed: UsageTapAllowed;
}
