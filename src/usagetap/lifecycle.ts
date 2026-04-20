import type {
  UsageTapCallOptions,
  UsageTapCallResult,
  UsageTapClient,
  UsageTapEndRequest,
  UsageTapEndUsage,
  UsageTapErrorPayload,
  UsageTapInvokeResult,
  UsageTapRequestInit,
} from './types.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInvokeResult<TResult>(value: TResult | UsageTapInvokeResult<TResult>): value is UsageTapInvokeResult<TResult> {
  return isObject(value) && 'result' in value && 'usage' in value;
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (!isObject(error)) {
    return undefined;
  }

  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if (typeof error.status === 'number') {
    return error.status;
  }

  if (isObject(error.response) && typeof error.response.status === 'number') {
    return error.response.status;
  }

  return undefined;
}

function attachEndErrorCause(thrownError: unknown, endError: unknown): never {
  if (thrownError instanceof Error) {
    if (thrownError.cause === undefined) {
      Object.defineProperty(thrownError, 'cause', {
        value: endError,
        configurable: true,
        writable: true,
      });
    }

    throw thrownError;
  }

  throw new AggregateError([thrownError, endError], 'Vendor call failed and UsageTap call_end also failed.');
}

export function defaultUsageTapErrorMapper(error: unknown): UsageTapErrorPayload {
  return {
    code: 'VENDOR_ERROR',
    message: String(error),
  };
}

export function beginUsageTapCall(client: UsageTapClient, begin: Parameters<UsageTapClient['beginCall']>[0], init?: UsageTapRequestInit) {
  return client.beginCall(begin, init);
}

export function endUsageTapCall(client: UsageTapClient, end: UsageTapEndRequest, init?: UsageTapRequestInit) {
  return client.endCall(end, init);
}

export async function withUsageTapCall<TResult>(
  client: UsageTapClient,
  options: UsageTapCallOptions<TResult>,
): Promise<UsageTapCallResult<TResult>> {
  const begin = await beginUsageTapCall(client, options.begin, { signal: options.signal });
  const onError = options.onError ?? defaultUsageTapErrorMapper;

  let result: TResult | undefined;
  let usage: UsageTapEndUsage | undefined;
  let thrownError: unknown;

  const setUsage = (nextUsage: UsageTapEndUsage): void => {
    usage = { ...usage, ...nextUsage };
  };

  try {
    const invoked = await options.invoke({
      begin,
      setUsage,
      signal: options.signal,
    });

    if (isInvokeResult(invoked)) {
      result = invoked.result;
      setUsage(invoked.usage);
    } else {
      result = invoked;
    }
  } catch (error) {
    thrownError = error;
  }

  const effectiveUsage: UsageTapEndUsage = {
    ...usage,
  };

  if (thrownError) {
    effectiveUsage.error = effectiveUsage.error ?? onError(thrownError);
    effectiveUsage.responseStatusCode = effectiveUsage.responseStatusCode ?? getErrorStatusCode(thrownError);
  } else {
    effectiveUsage.responseStatusCode = effectiveUsage.responseStatusCode ?? 200;
  }

  let end;
  try {
    end = await endUsageTapCall(client, {
      callId: begin.data.callId,
      ...effectiveUsage,
    }, { signal: options.signal });
  } catch (endError) {
    if (thrownError) {
      attachEndErrorCause(thrownError, endError);
    }
    throw endError;
  }

  if (thrownError) {
    throw thrownError;
  }

  return {
    result: result as TResult,
    begin,
    end,
    effectiveUsage,
  };
}
