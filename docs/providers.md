# Provider Adapters

PromptOpsKit ships six provider adapters. Direct `render()` calls always produce a `{ body, provider, model }` object shaped for the target API. Some providers also include optional transport metadata such as `baseURL` and `headers`. Async `renderPrompt()` helpers may instead return `{ provider, model, returnMessage }` when context validation is configured to short-circuit before request shaping. You handle the HTTP call and SDK setup.

## Supported providers

| Provider | Front matter value | Adapter |
|----------|-------------------|---------|
| OpenAI (Chat Completions) | `openai` | `openaiAdapter` |
| OpenAI (Responses API) | `openai-responses` | `openaiResponsesAdapter` |
| Anthropic | `anthropic` | `anthropicAdapter` |
| Google Gemini | `gemini` or `google` | `geminiAdapter` |
| OpenRouter | `openrouter` | `openrouterAdapter` |
| LLMAsAService Gateway | `llmasaservice` | `llmasaserviceAdapter` |


## Normalized front matter vs provider-specific options

PromptOpsKit already normalizes common settings across providers via front matter fields like `sampling`, `reasoning`, `response`, and `tools`.

When a provider has extra knobs with no clean cross-provider equivalent but PromptOpsKit knows how to place them, use `provider_options`:

```yaml
provider_options:
  anthropic:
    top_k: 50
    tool_choice:
      type: auto
  gemini:
    candidate_count: 2
    top_k: 20
    seed: 42
    response_modalities: ["TEXT"]
    thinking_budget_tokens: 2048
  openrouter:
    provider:
      order: ["anthropic", "openai"]
    transforms: ["middle-out"]
  llmasaservice:
    customer:
      customer_id: "cust_123"
      customer_name: "Acme"
```

This keeps portable settings in normalized fields, while still exposing advanced provider-specific controls.

For structured JSON output, prefer the neutral `response` block:

```yaml
response:
  format: json
  schema_name: support_reply
  schema_description: Structured support reply
  schema:
    type: object
    properties:
      answer:
        type: string
```

Adapters emit that neutral JSON Schema through each provider's native request shape:

| Provider | Emitted field |
|----------|---------------|
| `openai` / `openrouter` / `llmasaservice` | `response_format: { type: "json_schema", json_schema: { name, description?, schema, strict } }` |
| `openai-responses` | `text: { format: { type: "json_schema", name, description?, schema, strict } }` |
| `anthropic` | `output_config: { format: { type: "json_schema", schema } }` |
| `gemini` / `google` | `generationConfig.responseJsonSchema` |

Only drop to provider-specific schema fields for exceptional dialect needs, such as Gemini's native `provider_options.gemini.response_schema` or an Anthropic-native `provider_options.anthropic.output_config`.

Use `compression.thetokencompany` when a prompt template should be compressed before provider request generation and cache controls:

```yaml
compression:
  thetokencompany:
    enabled: true
    model: bear-2
    aggressiveness: 0.2
cache:
  openai:
    prompt_cache_key: support-reply-v1
    retention: 24h
```

When enabled, PromptOpsKit renders variables into the `# Prompt template`, sends that rendered text directly to TheTokenCompany with `fetch`, and uses the returned `output` as the user prompt. The caller supplies `theTokenCompany.apiKey` at render time or sets `THETOKENCOMPANY_API_KEY`/`TTC_API_KEY`. If credentials are unavailable or the backend call fails, PromptOpsKit preserves the original prompt text, returns a `POK057` warning in `warnings`, and reports zero token savings with matching input/output token counts. Library rendering does not log this fallback to the console. System instructions and history are left unchanged. Provider cache fields and cache-control markers are applied after compression, so the provider request contains the compressed or preserved prompt text.

Use `compression.heuristic` for local no-backend extractive compression. The default `mode: conservative` preserves whole source sentences, skips low-confidence matches, includes neighboring context when configured capacity allows, and leaves structured blocks unchanged. Set `json_to_toon: true` to convert complete JSON object/array inputs to TOON, or use `{{ json_payload | toon }}` on a context placeholder for one-off JSON-to-TOON insertion. Invalid JSON is preserved and returned with `POK031` instead of being sentence-compressed.

Use `compression.code` or `{{ source_code | compact }}` for code. Code compaction is local and does not sentence-select; it removes comments and formatting overhead by default. Prompt-level code compaction skips TheTokenCompany compression with `POK033`.

When a vendor adds a request-body field that PromptOpsKit does not model yet, use the explicit `raw` passthrough:

```yaml
raw:
  openai:
    service_tier: flex
  anthropic:
    service_tier: auto
  gemini:
    safetySettings:
      - category: HARM_CATEGORY_DANGEROUS_CONTENT
        threshold: BLOCK_ONLY_HIGH
  llmasaservice:
    customer:
      customer_id: cust_123
```

`raw.<provider>` is shallow-merged into the final request body after normalized fields and `provider_options`, so it can intentionally override generated fields. Treat it as a last-resort escape hatch and document why the raw field is present.


## Streaming support

`response.stream` support differs by provider:

| Provider | `response.stream` behavior |
|----------|----------------------------|
| `openai` | Mapped to body `stream` |
| `openai-responses` | Mapped to body `stream` |
| `anthropic` | Mapped to body `stream` |
| `openrouter` | Mapped to body `stream` (same as OpenAI) |
| `llmasaservice` | Mapped to body `stream` (same as OpenAI) |
| `gemini` | **Not body-mapped**; Gemini streaming is endpoint-based (`streamGenerateContent`) |

## Usage via `renderPrompt`

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit();

const result = await kit.renderPrompt({
  path: 'hello',
  provider: 'openai',
  variables: { name: 'World', app_context: 'Welcome screen' },
});

if (!result.request) {
  throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
}

const { request } = result;

// request.body is ready for fetch()
// request.provider is 'openai'
// request.model is 'gpt-5.4'
```

The provider passed to `renderPrompt` determines which adapter shapes the body. The `provider` field in front matter is informational — the render-time provider controls output.
When a prompt includes multiple cache blocks (for example `cache.openai` + `cache.anthropic`), adapters ignore non-matching blocks so cross-provider settings never leak into the wrong payload.
When a prompt includes multiple raw blocks, adapters also read only the block for the selected provider (`raw.openai`, `raw.openai-responses`, `raw.anthropic`, `raw.gemini`/`raw.google`, `raw.openrouter`, or `raw.llmasaservice`).
When a prompt enables compression or compaction, async `renderPrompt()` helpers transform the rendered prompt template before the selected provider adapter applies cache settings and shapes the final body.

## Direct adapter imports

```typescript
import { openaiAdapter } from 'promptopskit/openai';
import { openaiResponsesAdapter } from 'promptopskit/openai-responses';
import { anthropicAdapter } from 'promptopskit/anthropic';
import { geminiAdapter } from 'promptopskit/gemini';
import { openrouterAdapter } from 'promptopskit/openrouter';
import { llmasaserviceAdapter } from 'promptopskit/llmasaservice';
```

Each adapter implements the `ProviderAdapter` interface:

```typescript
interface ProviderAdapter {
  name: string;
  validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult;
  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest;
  validatePrompt(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): Promise<ValidationResult>;
  validatePrompt(lookup: ProviderPromptLookup, runtime?: RuntimeRenderOptions): Promise<ValidationResult>;
  validatePrompt(source: ProviderInlinePromptSource, runtime?: RuntimeRenderOptions): Promise<ValidationResult>;
  renderPrompt(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): Promise<ProviderPromptRenderResult>;
  renderPrompt(lookup: ProviderPromptLookup, runtime: RuntimeRenderOptions): Promise<ProviderPromptRenderResult>;
  renderPrompt(source: ProviderInlinePromptSource, runtime: RuntimeRenderOptions): Promise<ProviderPromptRenderResult>;
}
```

Direct adapter rendering accepts the same `environment` and `tier` selectors as `kit.renderPrompt()`. Use the synchronous `validate()` and `render()` methods when you already have a compiled `ResolvedPromptAsset`, and use the async `validatePrompt()` and `renderPrompt()` helpers when you want the adapter to resolve either markdown source or a compiled artifact from disk. Context input validation runs through the same shared prompt-input wrapper for OpenAI, OpenAI Responses, Anthropic, Gemini, OpenRouter, and LLMAsAService, so `allow_regex`, `deny_regex`, `non_empty`, `reject_secrets`, and `return_message` behave consistently across all six. For regex validators authored in YAML, prefer unquoted `/pattern/i` literals so backslash escapes stay copyable.

Server-side example:

```typescript
import { openaiAdapter } from 'promptopskit/openai';

const result = await openaiAdapter.renderPrompt(
  {
    path: 'summarizePullRequest',
  },
  {
    environment: 'dev',
    variables: {
      pull_request_body: 'Implement theming and dark mode across the app.',
    },
    strict: true,
  },
);

if (!('body' in result)) {
  throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
}

const request = result;
```

Pass `sourceDir` and `compiledDir` only when you want to override the default `./prompts` and `./.generated-prompts/json` locations.

## Choosing JSON vs ESM

PromptOpsKit's path-based runtime lookup reads compiled `.json` files from disk. That makes JSON the natural server default when you want to resolve prompts by key at runtime with `renderPrompt({ path })` or `createPromptOpsKit().renderPrompt({ path })`.

ESM is the better fit when prompts should be imported into code and bundled with the application instead of discovered from the filesystem at runtime.

| Format | Best when | Advantages | Tradeoffs |
|--------|-----------|------------|-----------|
| `json` | You want runtime lookup by prompt key on a Node server | Matches the built-in `compiledDir` lookup path, easy to regenerate, works well with the default `./.generated-prompts/json` layout | Depends on filesystem access, deployment packaging, and stable working-directory-relative paths |
| `esm` | You want prompts bundled as imports | Better for bundlers, browser-safe import flows, and deployments where static imports are more reliable than runtime fs reads | Not used by the built-in path lookup flow; you import the compiled prompt and call `adapter.render()` or `adapter.validate()` directly |

Deployment guidance:

- AWS Lambda: use `json` if you ship prompt artifacts alongside the function and want runtime lookup by path; use `esm` if your Lambda is bundled and you want prompts embedded via imports.
- Cloudflare Workers: prefer `esm` or inline prompt assets. Workers-style runtimes are bundle-oriented and do not match the filesystem-based `renderPrompt()` lookup model.
- Vercel: prefer `esm` for Edge or heavily bundled serverless functions; `json` is fine for Node functions only when the compiled asset directory is reliably included.
- Railway and container-style Node hosting: `json` is usually the simplest choice because the runtime filesystem layout is predictable.
- Browser or client-only code: use `esm` imports or inline prompt assets; do not rely on `renderPrompt()` filesystem lookup.

Rule of thumb:

- Choose `json` for server-side prompt resolution by file path.
- Choose `esm` for import-based rendering and bundle-oriented deployments.

## Browser / client-side usage

The top-level `promptopskit` runtime is Node-oriented. It supports prompt loading and compilation flows that import file-system/path modules, so do not use `createPromptOpsKit()` inside browser-only code or client components.

For browser or client-side code:

- Precompile prompts to ESM with `promptopskit compile --format esm` and import the generated artifact from `./.generated-prompts/esm`, or inline a small `ResolvedPromptAsset`.
- Pass `environment` and `tier` directly to `adapter.validate()` and `adapter.render()` when you need overrides on the client side.
- Avoid `renderPrompt()` in browser-only code because resolving prompt files from disk is Node-oriented.
- Keep provider credentials on the server. In production, use the rendered request body with a server endpoint, server action, or edge function that owns the API key.
- If you intentionally call a provider directly from browser code, treat it as a demo-only setup and explicitly note that the key is exposed.

Then render with a provider subpath adapter:

```typescript
import type { ResolvedPromptAsset } from 'promptopskit';
import { openaiAdapter } from 'promptopskit/openai';

const prompt: ResolvedPromptAsset = {
  id: 'summarizePullRequest',
  schema_version: 1,
  provider: 'openai',
  model: 'gpt-5.4',
  context: {
    inputs: [{ name: 'pull_request_body', max_size: 8000 }],
  },
  sections: {
    system_instructions: 'You summarize pull requests clearly and concisely.',
    prompt_template: 'Summarize this pull request:\n\n{{ pull_request_body }}',
  },
};

const validation = openaiAdapter.validate(prompt, {
  environment: 'prod',
});
if (!validation.valid) {
  throw new Error(validation.errors.join(' '));
}

const { body } = openaiAdapter.render(prompt, {
  environment: 'prod',
  variables: {
    pull_request_body: 'Implement theming and dark mode across the app.',
  },
  strict: true,
});

// Send `body` to your own server endpoint or server action.
```

This pattern keeps PromptOpsKit responsible for prompt rendering while leaving HTTP transport, auth, and browser-specific safety decisions in the app.

## Optional UsageTap tracking

If you want UsageTap begin/end tracking around a provider call, use the optional `promptopskit/usagetap` helper layer.

- The core adapters still only produce request bodies.
- Provider-specific runners are available for OpenAI, OpenRouter, LLMAsAService, Anthropic, and Gemini.
- Manual lifecycle control is available through `withUsageTapCall`.
- Entitlement-aware request mutation is opt-in and runs on a cloned request.

See [UsageTap](./usagetap.md) for setup, lifecycle helpers, entitlement behavior, tool gating, standalone usage extractors, and provider examples.

## OpenAI (`openai`)

Body shape: [Chat Completions API](https://platform.openai.com/docs/api-reference/chat)

```json
{
  "model": "gpt-5.4",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "reasoning_effort": "medium"
}
```

## OpenAI Responses (`openai-responses`)

Body shape: [Responses API](https://platform.openai.com/docs/api-reference/responses)

```json
{
  "model": "gpt-5.4",
  "instructions": "...",
  "input": [
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "reasoning": { "effort": "medium" }
}
```

Field mapping (differences from `openai`):

| Front matter | Body field (`openai-responses`) |
|-------------|----------------------------------|
| `sampling.max_output_tokens` | `max_output_tokens` |
| `reasoning.effort` | `reasoning: { effort }` |
| `response.format: json` | `text: { format: { type: "json_object" } }` |
| `response.schema` | `text: { format: { type: "json_schema", name, schema, strict } }` |
| `response.schema_description` | `text: { format: { description } }` |
| `sections.system_instructions` | `instructions` (top-level) |
| `history + prompt_template` | `input` items instead of `messages` |
| `tools` | Responses function tools (`{ type, name, description, parameters }`) |

Warnings:
- `reasoning.budget_tokens` is ignored (Responses uses `reasoning.effort`).

Extra supported options via `renderPrompt(..., { openaiResponses: { ... } })` or direct adapter runtime:
- `previous_response_id` (conversation chaining)
- `conversation` (mutually exclusive with `previous_response_id`)
- `parallel_tool_calls`, `max_tool_calls`
- `store`, `metadata`, `include`, `background`
- `instructions` override (runtime override for top-level instructions)

Field mapping:

| Front matter | Body field |
|-------------|-----------|
| `model` | `model` |
| `sampling.temperature` | `temperature` |
| `sampling.top_p` | `top_p` |
| `sampling.frequency_penalty` | `frequency_penalty` |
| `sampling.presence_penalty` | `presence_penalty` |
| `sampling.stop` | `stop` |
| `sampling.max_output_tokens` | `max_tokens` |
| `reasoning.effort` | `reasoning_effort` |
| `response.format: json` | `response_format: { type: "json_object" }` |
| `response.schema` | `response_format: { type: "json_schema", json_schema: { name, schema, strict } }` |
| `response.schema_description` | `response_format.json_schema.description` |
| `response.stream` | `stream` |
| `cache.openai.prompt_cache_key` | `prompt_cache_key` |
| `cache.openai.retention` | `prompt_cache_retention` |

Warnings:
- `reasoning.budget_tokens` is ignored (OpenAI uses `reasoning_effort` instead)

Caching notes:
- Prompt caching is already automatic for eligible OpenAI requests.
- `cache.openai.prompt_cache_key` helps route similar prefixes together.
- `cache.openai.retention` can be `in_memory` (default) or `24h`.

## Anthropic

Body shape: [Messages API](https://docs.anthropic.com/en/api/messages)

```json
{
  "model": "claude-sonnet-4-20250514",
  "messages": [
    { "role": "user", "content": "..." }
  ],
  "system": "...",
  "max_tokens": 4096
}
```

Key differences from OpenAI:

- System instructions go in a top-level `system` field, not in messages.
- `max_tokens` is **required** — defaults to `4096` if `sampling.max_output_tokens` is not set.
- `sampling.stop` maps to `stop_sequences`.
- `reasoning.budget_tokens` maps to `thinking: { type: "enabled", budget_tokens }`.
- `cache.anthropic.mode: automatic` maps to top-level `cache_control`.
- `cache.anthropic.mode: explicit` applies `cache_control` at block level for selected sections/tools.
- `cache.anthropic.ttl` supports `5m` (default) or `1h`.
- `response.schema` maps to `output_config.format: { type: "json_schema", schema }`.
- `response.schema_name` and `response.schema_description` are ignored by Anthropic because `output_config.format` only carries the schema contract.
- `provider_options.anthropic.top_k` maps to `top_k`.
- `provider_options.anthropic.tool_choice` maps to `tool_choice`.
- `provider_options.anthropic.output_config` maps directly to `output_config` and overrides the portable `response.schema` mapping.

Warnings:
- `frequency_penalty` and `presence_penalty` are not supported — ignored with a warning.
- `reasoning.effort` is not natively supported — warned that it will be mapped approximately.

## Gemini

Body shape: [generateContent API](https://ai.google.dev/api/generate-content)

```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "..." }] }
  ],
  "systemInstruction": {
    "parts": [{ "text": "..." }]
  },
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 2048
  }
}
```

Key differences:

- Uses `contents` array with `parts` objects instead of `messages`.
- Role `assistant` is mapped to `model`.
- System instructions go in a top-level `systemInstruction` field.
- Sampling parameters are nested under `generationConfig`.
- `top_p` maps to `topP`, `max_output_tokens` maps to `maxOutputTokens`, `stop` maps to `stopSequences`.
- `response.format: json` maps to `generationConfig.responseMimeType: "application/json"`.
- `response.schema` maps to `generationConfig.responseJsonSchema` (portable JSON Schema shape).
- `response.stream` is not body-mapped for Gemini; use the streaming endpoint (`streamGenerateContent`).
- `reasoning.effort` maps to `thinkingConfig.thinkingBudget` (high=8192, medium=4096, low=1024).
- `cache.gemini.cached_content` (or `cache.google.cached_content`) maps to top-level `cachedContent`.
- `provider_options.gemini.candidate_count` maps to `generationConfig.candidateCount`.
- `provider_options.gemini.top_k` maps to `generationConfig.topK`.
- `provider_options.gemini.seed` maps to `generationConfig.seed`.
- `provider_options.gemini.response_schema` maps to Gemini-native `generationConfig.responseSchema`.
- `provider_options.gemini.response_json_schema` maps to `generationConfig.responseJsonSchema` and overrides portable `response.schema` for Gemini.
- `provider_options.gemini.response_modalities` maps to `generationConfig.responseModalities`.
- `provider_options.gemini.thinking_budget_tokens` overrides effort-derived thinking budget.

Warnings:
- `frequency_penalty` and `presence_penalty` are not supported — ignored with a warning.

## OpenRouter

Body shape: OpenAI-compatible chat payloads, with additional OpenRouter routing fields when configured. The adapter reuses the normalized OpenAI chat mappings for shared fields, then applies `provider_options.openrouter` and `raw.openrouter`.

Your application is responsible for setting the different base URL and any extra headers (`HTTP-Referer`, `X-Title`).

OpenRouter-specific body fields can be supplied through `provider_options.openrouter`:

```yaml
provider_options:
  openrouter:
    provider:
      order:
        - anthropic
        - openai
    transforms:
      - middle-out
    models:
      - anthropic/claude-sonnet-4.5
      - openai/gpt-4o
```

Use `raw.openrouter` for less common OpenRouter body fields that PromptOpsKit does not model yet.

## UsageTap Gateway

Use `provider: usagetap` with `usagetapAdapter` for the first-party UsageTap gateway. It renders
OpenAI Chat Completions bodies with bearer authentication. The default model is
`usagetap/standard` and the default base URL is `https://gateway.usagetap.com/v1`; managed
`usagetap/premium`, canonical `provider/model` IDs, and ordered `fallback_models` are supported.
Customer attribution is optional. Supply `{ usagetap: { apiKey, idempotencyKey? } }` only at render
time. Typed gateway metadata and compression live under `provider_options.usagetap`; unsupported
fields can use `raw.usagetap`, which merges last.

Gateway calls are already authorized and metered by UsageTap. Do not wrap them in client-side
`beginUsageTapCall`/`endUsageTapCall`, `withUsageTapCall`, or provider runner helpers. Those lifecycle
APIs remain for metering direct calls made to other providers. Gateway compression is also distinct
from PromptOpsKit's local/client prompt compression pipeline.

Manual callers append `/chat/completions` to get
`https://gateway.usagetap.com/v1/chat/completions`, without adding another `/v1`.

## LLMAsAService Gateway

Body shape: OpenAI-compatible Chat Completions payloads sent to `https://gateway.llmasaservice.io`. The adapter reuses the OpenAI chat mapping, applies `provider_options.llmasaservice`, and reads `raw.llmasaservice` for gateway-only body fields.

If you use environment variables in your application, read them in app code and pass them explicitly to the adapter/helper:

```bash
LLM_GATEWAY_BASE_URL=https://gateway.llmasaservice.io
LLM_GATEWAY_API_KEY=<api key from llmasaservice admin>
LLM_GATEWAY_DEFAULT_MODEL=group:standard
```

Gateway-specific fields:

```yaml
provider: llmasaservice
model: group:standard
provider_options:
  llmasaservice:
    # Optional default; most applications should override customer at render time.
    customer:
      customer_id: "cust_123"
      customer_name: "Acme"
      customer_user_id: "user_456"
      customer_user_email: "user@example.com"
    conversationId: "optional-conversation-id"
    conversationTitle: "optional conversation title"
```

`customer`, `conversationId`, and `conversationTitle` are emitted in the JSON body. Customer attribution is usually known only at request time, so pass it through `runtime.provider_options.llmasaservice.customer` when rendering. A prompt file may include a default customer, but runtime values should override it for real user/customer traffic.

Pass the gateway API key through the render-time `llmasaservice.apiKey` option. The adapter emits `Authorization: Bearer <api-key>` and requires the API key plus a `customer.customer_id` value when validating for rendering. Project ids are no longer required. The deprecated `project_id`/`projectId` options remain available only for backward compatibility with gateway deployments that still use them.

OpenAI SDK setup:

```typescript
import OpenAI from 'openai';
import {
  createLLMAsAServiceOpenAIConfig,
  llmasaserviceAdapter,
} from 'promptopskit/llmasaservice';

const gateway = new OpenAI(createLLMAsAServiceOpenAIConfig({
  apiKey: process.env.LLM_GATEWAY_API_KEY!,
  baseURL: process.env.LLM_GATEWAY_BASE_URL,
}));

const request = llmasaserviceAdapter.render(prompt, {
  variables,
  llmasaservice: {
    apiKey: process.env.LLM_GATEWAY_API_KEY!,
  },
  runtime: {
    model: process.env.LLM_GATEWAY_DEFAULT_MODEL,
    provider_options: {
      llmasaservice: {
        customer: {
          customer_id: account.id,
          customer_name: account.name,
          customer_user_id: user.id,
          customer_user_email: user.email,
        },
      },
    },
  },
});

const completion = await gateway.chat.completions.create(request.body as any);
```

The gateway API key is required. `createLLMAsAServiceOpenAIConfig()` passes it to the OpenAI SDK, which sends it as bearer authorization. Keep this credential in server-side application configuration rather than prompt front matter.

For GPT-5 class OpenAI model selectors such as `gpt-5.2` or `openai:gpt-5.2`, `sampling.max_output_tokens` is emitted as `max_completion_tokens`. Other gateway selectors preserve the normal OpenAI-compatible fields.

Recommended response header logging after the SDK call, when your runtime exposes response headers:

- `x-request-id`
- `x-llm-model-id`
- `x-llm-model-group`

Manual smoke test:

```bash
curl https://gateway.llmasaservice.io/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LLM_GATEWAY_API_KEY" \
  -d '{
    "model": "group:standard",
    "messages": [{"role": "user", "content": "Say ok"}],
    "max_completion_tokens": 10,
    "customer": {
      "customer_id": "smoke-test",
      "customer_name": "Smoke Test"
    }
  }'
```

## Conversation history

Pass conversation history via the `history` option:

```typescript
const result = await kit.renderPrompt({
  path: 'chat',
  provider: 'openai',
  variables: { user_message: 'Thanks!' },
  history: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi! How can I help?' },
  ],
});

if (!result.request) {
  throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
}

const { request } = result;
```

History messages are inserted between system instructions and the prompt template in the messages array. For Gemini, role `assistant` is mapped to `model`.

If the prompt declares `context.history.max_items`, provider rendering compacts overflow history before shaping the request. Older turns become one preserved history item, and the most recent turns are kept as-is:

```yaml
context:
  history:
    max_items: 4
```

```typescript
const result = await kit.renderPrompt({
  path: 'chat',
  provider: 'openai',
  history,
  onHistoryCompaction: ({ overflow }) => ({
    role: 'user',
    content: `Earlier conversation summary: ${summarizeConversationUsingLLM(overflow)}`,
  }),
});
```

If no `onHistoryCompaction` callback is supplied, PromptOpsKit creates a plain text compacted history message. The behavior is shared by OpenAI, OpenAI Responses, Anthropic, Gemini, OpenRouter, and LLMAsAService.

## Tools

Tools defined in front matter are included in the request body. They can be string references or inline definitions:

```yaml
tools:
  - get_account_status
  - name: search_orders
    description: Search customer orders
    input_schema:
      type: object
      properties:
        query:
          type: string
```

String tool references are looked up in the `toolRegistry` passed at render time:

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables: { user_message: '...' },
  toolRegistry: {
    get_account_status: {
      type: 'function',
      function: { name: 'get_account_status', parameters: { ... } },
    },
  },
});

if (!result.request) {
  throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
}

const { request } = result;
```

If a string tool name is not found in the registry, a minimal stub is generated (`{ type: "function", function: { name } }` for OpenAI, `{ name }` for Anthropic/Gemini).

## Provider validation

Each adapter validates the asset before rendering. Common checks:

- All adapters require `model` to be set.
- Unsupported parameters trigger warnings (not errors) — the request is still generated.

```typescript
const adapter = getAdapter('openai');
const validation = adapter.validate(resolvedAsset, {
  environment: 'dev',
  tier: 'pro',
});
// { valid: boolean, errors: string[], warnings: string[] }
```
