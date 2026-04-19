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

const kit = createPromptOpsKit({ sourceDir: './prompts' });

const { request } = await kit.renderPrompt({
  path: 'hello',
  provider: 'openai',
  variables: { name: 'World' },
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
  validate(asset: ResolvedPromptAsset): ValidationResult;
  render(asset: ResolvedPromptAsset, runtime: RuntimeRenderOptions): ProviderRequest;
}
```

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
const validation = adapter.validate(resolvedAsset);
// { valid: boolean, errors: string[], warnings: string[] }
```
