# Schema Reference

Prompt files use YAML front matter. This page documents every supported field.

## Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique prompt identifier (e.g. `support/reply`) |
| `schema_version` | `number` | Yes | Schema version — currently `1` |
| `description` | `string` | No | Human-readable description of the prompt |
| `provider` | `string` | No | `openai`, `anthropic`, `gemini`, `google`, `openrouter`, `any` |
| `model` | `string` | No | Model name (e.g. `gpt-5.4`, `claude-sonnet-4-20250514`) |
| `fallback_models` | `string[]` | No | Ordered list of fallback models |
| `reasoning` | `object` | No | Reasoning/thinking configuration |
| `sampling` | `object` | No | Sampling parameters |
| `response` | `object` | No | Response format and streaming |
| `tools` | `array` | No | Tool references (strings or inline definitions) |
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
| `provider` | `enum` | Default provider (`openai`, `anthropic`, `google`, `gemini`, `openrouter`, `any`) |
| `model` | `string` | Default model identifier |
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
```

| Field | Type | Description |
|-------|------|-------------|
| `format` | `'text' \| 'json' \| 'markdown'` | Response format |
| `stream` | `boolean` | Enable streaming |

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
| `inputs` | `Array<string | { name, max_size?, trim?, allow_regex?, deny_regex? }>` | Expected variable names, optionally with size and runtime sanitization constraints |
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
- `allow_regex`: allowlist validation before interpolation; non-matches throw `POK031`.
- `deny_regex`: blocklist validation before interpolation; matches throw `POK032`.

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

Each environment/tier key maps to an overrides object. Overridable fields: `model`, `fallback_models`, `reasoning`, `sampling`, `response`, `tools`. See [Overrides](./overrides.md).

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
