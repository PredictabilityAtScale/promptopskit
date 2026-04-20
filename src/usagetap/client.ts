import type {
  UsageTapBeginRequest,
  UsageTapBeginResponse,
  UsageTapClient,
  UsageTapClientConfig,
  UsageTapEndRequest,
  UsageTapEndResponse,
  UsageTapRequestInit,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.usagetap.com';
const ACCEPT_HEADER = 'application/vnd.usagetap.v1+json';

function createUsageTapHttpError(status: number, body: unknown): Error & { statusCode: number; body: unknown } {
  const error = new Error(`UsageTap request failed with status ${status}`) as Error & {
    statusCode: number;
    body: unknown;
  };
  error.statusCode = status;
  error.body = body;
  return error;
}

export function createUsageTapClient(config: UsageTapClientConfig): UsageTapClient {
  const fetchImpl = config.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error('Fetch API is not available. Provide config.fetch when creating the UsageTap client.');
  }

  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');

  async function request<T>(path: string, body: unknown, init: UsageTapRequestInit = {}): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: ACCEPT_HEADER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: init.signal,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) as unknown : {};

    if (!response.ok) {
      throw createUsageTapHttpError(response.status, parsed);
    }

    return parsed as T;
  }

  return {
    request,
    beginCall(begin: UsageTapBeginRequest, init?: UsageTapRequestInit): Promise<UsageTapBeginResponse> {
      return request<UsageTapBeginResponse>('/call_begin', begin, init);
    },
    endCall(end: UsageTapEndRequest, init?: UsageTapRequestInit): Promise<UsageTapEndResponse> {
      return request<UsageTapEndResponse>('/call_end', end, init);
    },
  };
}
