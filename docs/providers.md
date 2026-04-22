# Provider Adapters

PromptOpsKit ships four provider adapters. Each produces a `{ body, provider, model }` object shaped for the target API. You handle the HTTP call — no auth, no headers, no HTTP client opinions.

## Supported providers

| Provider | Front matter value | Adapter |
|----------|-------------------|---------|
| OpenAI | `openai` | `openaiAdapter` |
| Anthropic | `anthropic` | `anthropicAdapter` |
| Google Gemini | `gemini` or `google` | `geminiAdapter` |
| OpenRouter | `openrouter` | `openrouterAdapter` |

## Usage via `renderPrompt`

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit();

const { request } = await kit.renderPrompt({
  path: 'hello',
  provider: 'openai',
  variables: { name: 'World', app_context: 'Welcome screen' },
});

// request.body is ready for fetch()
// request.provider is 'openai'
// request.model is 'gpt-5.4'
```

The provider passed to `renderPrompt` determines which adapter shapes the body. The `provider` field in front matter is informational — the render-time provider controls output.

## Direct adapter imports

```typescript
import { openaiAdapter } from 'promptopskit/openai';
import { anthropicAdapter } from 'promptopskit/anthropic';
import { geminiAdapter } from 'promptopskit/gemini';
import { openrouterAdapter } from 'promptopskit/openrouter';
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
  renderPrompt(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): Promise<ProviderRequest>;
  renderPrompt(lookup: ProviderPromptLookup, runtime: RuntimeRenderOptions): Promise<ProviderRequest>;
  renderPrompt(source: ProviderInlinePromptSource, runtime: RuntimeRenderOptions): Promise<ProviderRequest>;
}
```

Direct adapter rendering accepts the same `environment` and `tier` selectors as `kit.renderPrompt()`. Use the synchronous `validate()` and `render()` methods when you already have a compiled `ResolvedPromptAsset`, and use the async `validatePrompt()` and `renderPrompt()` helpers when you want the adapter to resolve either markdown source or a compiled artifact from disk.

Server-side example:

```typescript
import { openaiAdapter } from 'promptopskit/openai';

const request = await openaiAdapter.renderPrompt(
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
- Provider-specific runners are available for OpenAI, OpenRouter, Anthropic, and Gemini.
- Manual lifecycle control is available through `withUsageTapCall`.
- Entitlement-aware request mutation is opt-in and runs on a cloned request.

See [UsageTap](./usagetap.md) for setup, lifecycle helpers, entitlement behavior, tool gating, standalone usage extractors, and provider examples.

## OpenAI

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
| `response.stream` | `stream` |

Warnings:
- `reasoning.budget_tokens` is ignored (OpenAI uses `reasoning_effort` instead)

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
- `reasoning.effort` maps to `thinkingConfig.thinkingBudget` (high=8192, medium=4096, low=1024).

Warnings:
- `frequency_penalty` and `presence_penalty` are not supported — ignored with a warning.

## OpenRouter

Body shape: Same as OpenAI. OpenRouter is a thin layer over the OpenAI adapter — same body structure, only the `provider` label differs to `"openrouter"`.

Your application is responsible for setting the different base URL and any extra headers (`HTTP-Referer`, `X-Title`).

## Conversation history

Pass conversation history via the `history` option:

```typescript
const { request } = await kit.renderPrompt({
  path: 'chat',
  provider: 'openai',
  variables: { user_message: 'Thanks!' },
  history: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi! How can I help?' },
  ],
});
```

History messages are inserted between system instructions and the prompt template in the messages array. For Gemini, role `assistant` is mapped to `model`.

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
const { request } = await kit.renderPrompt({
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
