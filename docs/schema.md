# Schema Reference

Prompt files use YAML front matter. This page documents every supported field.

## Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique prompt identifier (e.g. `support/reply`) |
| `schema_version` | `number` | Yes | Schema version — currently `1` |
| `description` | `string` | No | Human-readable description of the prompt |
| `provider` | `string` | No | `openai`, `openai-responses`, `anthropic`, `gemini`, `google`, `openrouter`, `any` |
| `model` | `string` | No | Model name (e.g. `gpt-5.4`, `claude-sonnet-4-20250514`) |
| `fallback_models` | `string[]` | No | Ordered list of fallback models |
| `reasoning` | `object` | No | Reasoning/thinking configuration |
| `sampling` | `object` | No | Sampling parameters |
| `response` | `object` | No | Response format and streaming |
| `cache` | `object` | No | Provider-specific prompt/context caching options |
| `tools` | `array` | No | Tool references (strings or inline definitions) |
| `provider_options` | `object` | No | Provider-specific advanced options (`anthropic`, `gemini`, `openrouter`) |
| `raw` | `object` | No | Provider-scoped request-body passthrough for fields PromptOpsKit does not model yet |
| `mcp` | `object` | No | MCP server references |
| `context` | `object` | No | Declare expected variables and history settings |
| `includes` | `string[]` | No | Paths to included prompt files (relative to this file) |
| `environments` | `object` | No | Named environment overrides |
| `tiers` | `object` | No | Named tier overrides |
| `metadata` | `object` | No | Prompt metadata |

## `defaults.md` schema

`defaults.md` files use a subset of the prompt schema. Only these fields are recognized:

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `enum` | Default provider (`openai`, `openai-responses`, `anthropic`, `google`, `gemini`, `openrouter`, `any`) |
| `model` | `string` | Default model identifier |
| `cache` | `object` | Same as prompt-level `cache` block |
| `metadata` | `object` | Same as the prompt `metadata` block (`owner`, `tags`, `review_required`, `stable`) |
| `# System instructions` | section | System instructions inherited by prompts in this folder |

See [Prompt Format — Folder defaults](./prompt-format.md#folder-defaults-defaultsmd) for inheritance rules.

## `reasoning`

```yaml
reasoning:
  effort: medium        # low | medium | high
  budget_tokens: 4096   # positive integer
```

| Field | Type | Description |
|-------|------|-------------|
| `effort` | `'low' \| 'medium' \| 'high'` | Reasoning effort level |
| `budget_tokens` | `number` | Token budget for thinking (positive integer) |

Provider mapping:
- **OpenAI**: `effort` maps to `reasoning_effort`; `budget_tokens` is ignored.
- **Anthropic**: `budget_tokens` maps to `thinking.budget_tokens`; `effort` is warned.
- **Gemini**: `effort` maps to `thinkingConfig.thinkingBudget` (low=1024, medium=4096, high=8192).

## `sampling`

```yaml
sampling:
  temperature: 0.7
  top_p: 0.9
  frequency_penalty: 0.5
  presence_penalty: 0.3
  stop:
    - "\n"
    - "END"
  max_output_tokens: 2048
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `temperature` | `number` | 0–2 | Randomness |
| `top_p` | `number` | 0–1 | Nucleus sampling threshold |
| `frequency_penalty` | `number` | — | Frequency penalty (OpenAI only) |
| `presence_penalty` | `number` | — | Presence penalty (OpenAI only) |
| `stop` | `string[]` | — | Stop sequences |
| `max_output_tokens` | `number` | >0 | Maximum output tokens |

## `response`

```yaml
response:
  format: json    # text | json | markdown
  stream: true
  schema:
    type: object
    properties:
      answer:
        type: string
  schema_name: support_reply
  schema_description: Support reply payload
  schema_strict: true
```

| Field | Type | Description |
|-------|------|-------------|
| `format` | `'text' \| 'json' \| 'markdown'` | Response format |
| `stream` | `boolean` | Enable streaming |
| `schema` | `object` | Portable JSON Schema object for structured output |
| `schema_name` | `string` | Optional schema name (used by OpenAI/OpenAI Responses) |
| `schema_description` | `string` | Optional schema description (used by OpenAI/OpenAI Responses/OpenRouter structured outputs) |
| `schema_strict` | `boolean` | Strict schema enforcement toggle (OpenAI/OpenAI Responses) |

Provider mapping:
- **OpenAI / OpenRouter**: `response.schema` maps to `response_format.json_schema`; `schema_description` maps to `json_schema.description`.
- **OpenAI Responses**: `response.schema` maps to `text.format`; `schema_description` maps to `text.format.description`.
- **Anthropic**: `response.schema` maps to `output_config.format` with `type: json_schema` and `schema`.
- **Gemini**: `response.schema` maps to `generationConfig.responseJsonSchema`.

Use `response.schema` for provider-neutral JSON Schema. Use provider-specific schema fields only for exceptional cases where a vendor's native schema dialect is required.

## `provider_options`

Provider-specific options that are intentionally non-portable:

```yaml
provider_options:
  anthropic:
    top_k: 40
    tool_choice:
      type: auto
    output_config:
      format:
        type: json_schema
        schema:
          type: object
  gemini:
    candidate_count: 1
    top_k: 32
    seed: 42
    # Use only when Gemini's native responseSchema dialect is required.
    response_schema:
      type: object
    # Use only for a Gemini-specific JSON Schema override.
    response_json_schema:
      type: object
    response_modalities:
      - TEXT
    thinking_budget_tokens: 1024
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

| Field | Type | Description |
|-------|------|-------------|
| `anthropic.top_k` | `number` | Anthropic `top_k` sampling control (`>= 0`) |
| `anthropic.tool_choice` | `object` | Anthropic tool choice object |
| `anthropic.output_config` | `object` | Anthropic-native structured output config; overrides portable `response.schema` mapping |
| `gemini.candidate_count` | `number` | Gemini candidate count (`> 0`) |
| `gemini.top_k` | `number` | Gemini top-k sampling control (`>= 0`) |
| `gemini.seed` | `number` | Gemini generation seed |
| `gemini.response_schema` | `object` | Gemini-native `responseSchema` dialect for exceptional Gemini-only prompts |
| `gemini.response_json_schema` | `object` | Gemini JSON Schema override mapped to `generationConfig.responseJsonSchema`; overrides portable `response.schema` for Gemini |
| `gemini.response_modalities` | `string[]` | Gemini response modalities |
| `gemini.thinking_budget_tokens` | `number` | Gemini thinking budget (`> 0`) |
| `openrouter.provider` | `object` | OpenRouter provider routing preferences |
| `openrouter.transforms` | `string[]` | OpenRouter transforms |
| `openrouter.plugins` | `object[]` | OpenRouter plugin definitions |
| `openrouter.models` | `string[]` | OpenRouter fallback model list |

## `raw`

Use `raw` as an explicit vendor escape hatch when an API adds a request-body field before PromptOpsKit has a first-class schema field for it.

```yaml
raw:
  openai:
    service_tier: flex
  openai-responses:
    truncation: auto
  anthropic:
    service_tier: auto
  gemini:
    safetySettings:
      - category: HARM_CATEGORY_DANGEROUS_CONTENT
        threshold: BLOCK_ONLY_HIGH
  openrouter:
    usage:
      include: true
```

Supported keys: `openai`, `openai-responses` (or `openai_responses`), `anthropic`, `gemini` (or `google`), and `openrouter`.

Raw fields are shallow-merged into the final provider request body after normalized fields and `provider_options`. That means `raw` can intentionally override generated fields such as `temperature`, but it should be used sparingly and documented in `# Notes` because it is provider-specific.

## `tools`

An array of tool references. Each element is either a string name or an inline definition:

```yaml
tools:
  - get_account_status          # string reference
  - name: search_orders         # inline definition
    description: Search orders
    input_schema:
      type: object
      properties:
        query:
          type: string
```

Inline tool definition fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Tool name |
| `description` | `string` | No | Tool description |
| `input_schema` | `object` | No | JSON Schema for tool input |

## `cache`

```yaml
cache:
  openai:
    prompt_cache_key: support-v1
    retention: in_memory   # in_memory | 24h
  anthropic:
    mode: automatic        # automatic | explicit
    ttl: 5m                # 5m | 1h
    cache_system_instructions: true
    cache_tools: true
    cache_prompt_template: false
  gemini:
    cached_content: cachedContents/1234567890
```

| Field | Type | Description |
|-------|------|-------------|
| `openai.prompt_cache_key` | `string` | Optional routing key to improve cache-hit locality on shared prefixes |
| `openai.retention` | `'in_memory' \| '24h'` | Prompt cache retention policy |
| `anthropic.mode` | `'automatic' \| 'explicit'` | Automatic top-level caching or explicit block-level cache breakpoints |
| `anthropic.type` | `'ephemeral'` | Cache type (currently only `ephemeral`) |
| `anthropic.ttl` | `'5m' \| '1h'` | Anthropic cache duration |
| `anthropic.cache_system_instructions` | `boolean` | In explicit mode, cache system instructions block |
| `anthropic.cache_tools` | `boolean` | In explicit mode, cache tool declarations |
| `anthropic.cache_prompt_template` | `boolean` | In explicit mode, cache prompt-template user block |
| `gemini.cached_content` / `google.cached_content` | `string` | Previously created Gemini cache resource name used as `cachedContent` |

You can define multiple provider cache blocks in one prompt; each adapter reads only its own cache settings.

## `mcp`

```yaml
mcp:
  servers:
    - my-server               # string reference
    - name: custom-server     # object reference
      config:
        url: "https://..."
```

## `context`

```yaml
context:
  inputs:
    - user_message
    - name: account_summary
      max_size: 4096
  history:
    max_items: 8
```

| Field | Type | Description |
|-------|------|-------------|
| `inputs` | `Array<string | { name, max_size?, trim?, allow_regex?, deny_regex?, non_empty?, reject_secrets? }>` | Expected variable names, optionally with size and runtime sanitization constraints |
| `history` | `object` | History settings |
| `history.max_items` | `number` | Maximum history items |

String-form inputs remain valid:

```yaml
context:
  inputs:
    - user_message
    - account_summary
```

Object-form inputs add optional controls:

- `max_size`: checked during `renderPrompt()` and can produce `POK030` warnings.
- `trim`: trims incoming values to the `max_size` budget before interpolation (`true`/`end` keeps leading bytes, `start` keeps trailing bytes).
- `allow_regex`: allowlist validation before interpolation; accepts `"pattern"`, `/pattern/i`, or `{ pattern, flags, return_message? }`. Non-matches throw `POK031` unless `return_message` is configured.
- `deny_regex`: blocklist validation before interpolation; accepts `"pattern"`, `/pattern/i`, or `{ pattern, flags, return_message? }`. Matches throw `POK032` unless `return_message` is configured.
- `non_empty`: accepts `true` or `{ return_message }`; blank values throw `POK033` unless `return_message` is configured.
- `reject_secrets`: accepts `true` or `{ return_message }`; secret-like values throw `POK034` unless `return_message` is configured.

Malformed `allow_regex` and `deny_regex` values are reported during `validate` and `compile` with `POK013`.

## `includes`

```yaml
includes:
  - ./shared/tone.md
  - ./shared/safety.md
```

Paths are resolved relative to the file declaring them. See [Composition](./composition.md).

## `environments` / `tiers`

```yaml
environments:
  dev:
    model: gpt-5.4-mini
    sampling:
      temperature: 0.2
  prod:
    model: gpt-5.4
tiers:
  free:
    model: gpt-5.4-mini
  pro:
    model: gpt-5.4
```

Each environment/tier key maps to an overrides object. Overridable fields: `model`, `fallback_models`, `reasoning`, `sampling`, `response`, `cache`, `raw`, `tools`, `provider_options`. See [Overrides](./overrides.md).

## `metadata`

```yaml
metadata:
  owner: support-platform
  tags:
    - customer-facing
    - production
  review_required: true
  stable: true
```

| Field | Type | Description |
|-------|------|-------------|
| `owner` | `string` | Team or person responsible |
| `tags` | `string[]` | Categorization tags |
| `review_required` | `boolean` | Whether changes need review |
| `stable` | `boolean` | Whether the prompt is considered stable |

## Sections (body)

These are populated by the parser from H1 headings in the Markdown body — they are not authored in YAML:

| Section | Description |
|---------|-------------|
| `system_instructions` | From `# System instructions` |
| `prompt_template` | From `# Prompt template` |
| `notes` | From `# Notes` |

## `source` (internal)

Populated by the parser — not authored:

| Field | Type | Description |
|-------|------|-------------|
| `file_path` | `string` | Absolute path to the source file |
| `checksum` | `string` | File checksum |

## Zod schemas

The schema definitions are available as Zod schemas for programmatic use:

```typescript
import { PromptAssetSchema, PromptAssetOverridesSchema } from 'promptopskit';

// Validate arbitrary data
const result = PromptAssetSchema.safeParse(data);
```
