# UsageTap

PromptOpsKit includes an optional `promptopskit/usagetap` helper layer for UsageTap.com call tracking. It wraps your own provider call with `call_begin` and `call_end` requests while keeping the core prompt rendering API body-only.

## Install surface

UsageTap helpers ship inside the main package under a separate subpath:

```typescript
import {
  createUsageTapClient,
  runOpenAIWithUsageTap,
  runOpenRouterWithUsageTap,
  runAnthropicWithUsageTap,
  runGeminiWithUsageTap,
  withUsageTapCall,
  extractOpenAIUsage,
  extractAnthropicUsage,
  extractGeminiUsage,
} from 'promptopskit/usagetap';
```

The helper layer does not add an SDK dependency. It uses `fetch` directly against `https://api.usagetap.com` and sends:

- `Authorization: Bearer ...`
- `Accept: application/vnd.usagetap.v1+json`
- `Content-Type: application/json`

## Create a client

```typescript
import { createUsageTapClient } from 'promptopskit/usagetap';

const usageTap = createUsageTapClient({
  apiKey: process.env.USAGETAP_API_KEY!,
});
```

You can also override `baseUrl` or `fetch` for tests and custom runtimes.

## Track a provider call

```typescript
import { createPromptOpsKit } from 'promptopskit';
import { createUsageTapClient, runOpenAIWithUsageTap } from 'promptopskit/usagetap';

const kit = createPromptOpsKit({ sourceDir: './prompts' });
const usageTap = createUsageTapClient({ apiKey: process.env.USAGETAP_API_KEY! });

const { request } = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables: {
    user_message: 'How do I reset my password?',
    app_context: 'Account settings page',
  },
});

const tracked = await runOpenAIWithUsageTap(usageTap, {
  begin: {
    customerId: 'user_123',
    feature: 'chat.send',
    requested: { standard: true, premium: true, search: true },
    idempotencyKey: 'chat-send-user-123-req-456',
  },
  request,
  entitlementMode: 'apply',
  modelTiers: {
    standard: 'gpt-5.4-mini',
    premium: 'gpt-5.4',
  },
  toolEntitlements: {
    image_tool: 'image',
    web_lookup: 'search',
  },
  invoke: async (requestUsed) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestUsed.body),
    });

    return response.json();
  },
});

tracked.response;
tracked.begin;
tracked.end;
tracked.requestUsed;
tracked.effectiveUsage;
tracked.allowed;
```

`runOpenRouterWithUsageTap`, `runAnthropicWithUsageTap`, and `runGeminiWithUsageTap` follow the same pattern.

## Entitlement mode

`entitlementMode` defaults to `'off'`.

- `'off'`: track the call, but do not change the provider request.
- `'apply'`: clone the provider request and apply UsageTap allowances before invoking the vendor.

When `entitlementMode: 'apply'` is enabled, helpers can:

- Swap to `modelTiers.standard` or `modelTiers.premium`.
- Cap OpenAI or OpenRouter `reasoning_effort`.
- Cap Gemini `thinkingConfig.thinkingBudget`. If no Gemini thinking budget was present, the helper now sets one from the allowed reasoning level.
- Remove built-in OpenAI `web_search` when `allowed.search === false`.
- Remove named tools according to `toolEntitlements` for OpenAI, Anthropic, and Gemini function declarations.

Notes:

- Mutations happen on a cloned request. The original `request` object is left unchanged.
- Built-in tool gating is intentionally narrow today. Only OpenAI `web_search` is handled automatically; other built-ins must be mapped through your own tool policy.
- Applying Gemini reasoning limits can introduce a `thinkingConfig` block even when the original request omitted one.

## Manual lifecycle control

Use `withUsageTapCall` when you want begin/invoke/end tracking without a provider-specific helper.

```typescript
import { createUsageTapClient, withUsageTapCall } from 'promptopskit/usagetap';

const usageTap = createUsageTapClient({ apiKey: process.env.USAGETAP_API_KEY! });

const tracked = await withUsageTapCall(usageTap, {
  begin: {
    customerId: 'user_123',
    feature: 'embeddings.index',
  },
  invoke: async ({ setUsage, signal }) => {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-large',
        input: 'PromptOpsKit',
      }),
    }).then((result) => result.json());

    setUsage({
      modelUsed: 'text-embedding-3-large',
      inputTokens: 6,
    });

    return response;
  },
});
```

`withUsageTapCall` also accepts an invoke result shaped like `{ result, usage }` if you prefer to return the usage payload directly.

If the vendor call throws and UsageTap `call_end` also fails, the original vendor error is rethrown and the UsageTap failure is attached as `error.cause` when possible.

## Standalone usage extractors

The provider runners use public extractor helpers that you can call yourself:

- `extractOpenAIUsage(response, meta)`
- `extractAnthropicUsage(response, meta)`
- `extractGeminiUsage(response, meta)`

They map common token fields into the UsageTap `call_end` payload shape:

- OpenAI and OpenRouter: `usage.prompt_tokens`, `completion_tokens`, cached prompt tokens, reasoning tokens
- Anthropic: `usage.input_tokens`, `output_tokens`, `cache_read_input_tokens`
- Gemini: `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`, `thoughtsTokenCount`

## API surface

Main exports:

- `createUsageTapClient`
- `beginUsageTapCall`
- `endUsageTapCall`
- `withUsageTapCall`
- `applyUsageTapEntitlements`
- `runOpenAIWithUsageTap`
- `runOpenRouterWithUsageTap`
- `runAnthropicWithUsageTap`
- `runGeminiWithUsageTap`
- `extractOpenAIUsage`
- `extractAnthropicUsage`
- `extractGeminiUsage`
- `defaultUsageTapErrorMapper`

Relevant types:

- `UsageTapBeginRequest`
- `UsageTapBeginResponse`
- `UsageTapEndUsage`
- `UsageTapCallOptions`
- `UsageTapProviderRunOptions`
- `UsageTapEntitlementOptions`
- `UsageTapAllowed`

For the rest of the PromptOpsKit provider model, see [Providers](./providers.md).