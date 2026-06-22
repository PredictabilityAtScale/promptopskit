# Schema Reference

Prompt files use YAML front matter. This page documents every supported field.

## Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique prompt identifier (e.g. `support/reply`) |
| `schema_version` | `number` | Yes | Schema version — currently `1` |
| `description` | `string` | No | Human-readable description of the prompt |
| `provider` | `string` | No | `openai`, `openai-responses`, `anthropic`, `gemini`, `google`, `openrouter`, `llmasaservice`, `any` |
| `model` | `string` | No | Model name (e.g. `gpt-5.4`, `claude-sonnet-4-20250514`) |
| `fallback_models` | `string[]` | No | Ordered list of fallback models |
| `reasoning` | `object` | No | Reasoning/thinking configuration |
| `sampling` | `object` | No | Sampling parameters |
| `response` | `object` | No | Response format and streaming |
| `compression` | `object` | No | Prompt-template compression options |
| `cache` | `object` | No | Provider-specific prompt/context caching options |
| `tools` | `array` | No | Tool references (strings or inline definitions) |
| `provider_options` | `object` | No | Provider-specific advanced options (`anthropic`, `gemini`, `openrouter`, `llmasaservice`) |
| `raw` | `object` | No | Provider-scoped request-body passthrough for fields PromptOpsKit does not model yet |
| `mcp` | `object` | No | MCP server references |
| `context` | `object` | No | Declare expected variables and history settings |
| `includes` | `string[]` | No | Paths to included prompt files (relative to this file) |
| `environments` | `object` | No | Named environment overrides |
| `tiers` | `object` | No | Named tier overrides |
| `metadata` | `object` | No | Prompt metadata |

## `defaults.md` schema

`defaults.md` files use the shareable behavior/configuration subset of the prompt schema. Identity fields such as `id`, `schema_version`, and `description` stay prompt-local.

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `enum` | Default provider (`openai`, `openai-responses`, `anthropic`, `google`, `gemini`, `openrouter`, `llmasaservice`, `any`) |
| `model` | `string` | Default model identifier |
| `fallback_models` | `string[]` | Default fallback models |
| `reasoning` | `object` | Same as prompt-level `reasoning` block |
| `sampling` | `object` | Same as prompt-level `sampling` block |
| `response` | `object` | Same as prompt-level `response` block |
| `compression` | `object` | Same as prompt-level `compression` block |
| `cache` | `object` | Same as prompt-level `cache` block |
| `provider_options` | `object` | Same as prompt-level `provider_options` block |
| `raw` | `object` | Same as prompt-level `raw` block |
| `tools` | `array` | Same as prompt-level `tools` block |
| `mcp` | `object` | Same as prompt-level `mcp` block |
| `context` | `object` | Same as prompt-level `context` block |
| `includes` | `string[]` | Same as prompt-level `includes` block |
| `environments` | `object` | Same as prompt-level `environments` block |
| `tiers` | `object` | Same as prompt-level `tiers` block |
| `metadata` | `object` | Same as the prompt `metadata` block (`owner`, `tags`, `review_required`, `stable`) |
| `# System instructions` | section | System instructions inherited by prompts in this folder |

Scalars and arrays are replaced by nearer defaults or prompt-local values. Object blocks are shallow-merged, including provider-specific sub-blocks such as `provider_options.llmasaservice`.

Inherited `includes` are authored relative to the `defaults.md` file that declares them and normalized before prompt include resolution.

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
# Inline schema
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

# External schema reference (mutually exclusive with `schema`)
response:
  format: json
  schema_ref: ./schemas/support-reply.schema.json

# External zod module reference (must export default or named `schema`)
response:
  format: json
  schema_ref: ./schemas/support-reply.schema.mjs
```

| Field | Type | Description |
|-------|------|-------------|
| `format` | `'text' \| 'json' \| 'markdown'` | Response format |
| `stream` | `boolean` | Enable streaming |
| `schema` | `object` | Portable JSON Schema object for structured output |
| `schema_ref` | `string` | Relative path to external schema (`.json`) or zod module (`.js/.mjs/.cjs`) |
| `schema_name` | `string` | Optional schema name (used by OpenAI/OpenAI Responses) |
| `schema_description` | `string` | Optional schema description (used by OpenAI/OpenAI Responses/OpenRouter/LLMAsAService structured outputs) |
| `schema_strict` | `boolean` | Strict schema enforcement toggle (OpenAI/OpenAI Responses) |

Provider mapping:
- **OpenAI / OpenRouter / LLMAsAService**: `response.schema` maps to `response_format.json_schema`; `schema_description` maps to `json_schema.description`.
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
  llmasaservice:
    project_id: llm-project-id
    customer:
      customer_id: cust_123
      customer_name: Acme
    conversationId: conv_123
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
| `llmasaservice.base_url` | `string` | Gateway base URL override |
| `llmasaservice.project_id` | `string` | Gateway project id emitted as `x-project-id` |
| `llmasaservice.customer` | `object` | Optional default gateway customer attribution object; usually supplied through runtime overrides |
| `llmasaservice.conversationId` | `string` | Optional gateway conversation id |
| `llmasaservice.conversationTitle` | `string` | Optional gateway conversation title |

For `provider: llmasaservice`, static validation warns if `project_id` or `customer.customer_id` is missing because these values are often supplied at render time. When validating with render-time overrides, the adapter requires `provider_options.llmasaservice.project_id` so the rendered request can emit `headers['x-project-id']`, and it requires a gateway customer id in `provider_options.llmasaservice.customer.customer_id` or `raw.llmasaservice.customer.customer_id`.

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
  llmasaservice:
    customer:
      customer_id: cust_123
```

Supported keys: `openai`, `openai-responses` (or `openai_responses`), `anthropic`, `gemini` (or `google`), `openrouter`, and `llmasaservice`.

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

## `compression`

Use `compression.thetokencompany` to compress the rendered `# Prompt template` before provider messages are generated:

```yaml
compression:
  thetokencompany:
    enabled: true
    model: bear-2
    aggressiveness: 0.2
```

| Field | Type | Description |
|-------|------|-------------|
| `thetokencompany.enabled` | `boolean` | Set `true` to call TheTokenCompany compression; set `false` in a prompt, environment, tier, or runtime override to disable inherited compression |
| `thetokencompany.model` | `string` | Compression model; defaults to `bear-2` |
| `thetokencompany.aggressiveness` | `number` | Compression aggressiveness from `0` to `1`; omitted when not configured |
| `heuristic.enabled` | `boolean` | Set `true` to run local heuristic compression with no backend call |
| `heuristic.min_tokens` | `number` | Minimum estimated token budget to preserve; defaults to `80` |
| `heuristic.max_sentences` | `number` | Maximum selected sentences; defaults to `10` |
| `heuristic.target_reduction` | `number` | Target reduction ratio from `0` to `1`; defaults to `0.45` |
| `heuristic.query` | `string` | Optional relevance query used for sentence scoring |
| `heuristic.query_variable` | `string` | Runtime variable whose value is used as the relevance query |
| `heuristic.json_to_toon` | `boolean` | When `true`, complete JSON object/array inputs are converted to TOON; invalid JSON is preserved with `POK031` |
| `heuristic.mode` | `"conservative" \| "balanced"` | Compression behavior; defaults to `conservative` for lower risk of meaning loss |
| `heuristic.preserve_neighbors` | `boolean` | Include adjacent sentences around selected matches when `max_sentences` allows; defaults to `true` in conservative mode |
| `heuristic.fail_on_low_confidence` | `boolean` | Preserve the original value when query terms are missing or unmatched; defaults to `true` in conservative mode |
| `code.enabled` | `boolean` | Set `true` to compact code instead of text-compressing it |
| `code.remove_comments` | `boolean` | Remove line and block comments; defaults to `true` |
| `code.trim_indentation` | `boolean` | Remove common leading indentation; defaults to `true` |
| `code.collapse_blank_lines` | `boolean` | Remove blank lines; defaults to `true` |

For backend compression, pass the caller's TheTokenCompany API key at render time:

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  theTokenCompany: {
    apiKey: process.env.THETOKENCOMPANY_API_KEY,
  },
});
```

If `theTokenCompany.apiKey` is omitted, PromptOpsKit also checks `THETOKENCOMPANY_API_KEY` and `TTC_API_KEY`. The request is sent directly to `POST https://api.thetokencompany.com/v1/compress` with no vendor SDK dependency. If credentials are unavailable or the backend call fails, PromptOpsKit preserves the original prompt text, returns a `POK057` warning in `warnings`, and reports zero token savings with matching input/output token counts. Library rendering does not log this fallback to the console. Compression applies only to the current rendered prompt template; system instructions and conversation history are left unchanged.

Compression happens before provider request generation, so provider cache fields and cache-control markers are applied to the compressed prompt text. Local heuristic compression is extractive: conservative mode preserves whole source sentences, skips structured blocks, and returns `POK031` warnings when compression is skipped for low confidence.

For per-placeholder compression, add `compression: heuristic`, `compression.heuristic`, `compression: code`, or `compression.code` to a `context.inputs` object. Use `{{ context_value | compress }}` for heuristic text compression, `{{ json_payload | toon }}` to convert one JSON placeholder value to TOON, or `{{ source_code | compact }}` to compact code without sentence extraction. Placeholder modifiers are single-token shortcuts; use `context.inputs[].compression` for options.

When prompt-level `compression.code.enabled: true`, PromptOpsKit skips TheTokenCompany compression with `POK033` so code is not backend text-compressed.

Credit: the local heuristic approach is based on Jason Kneen's [open-thetokenco](https://github.com/jasonkneen/open-thetokenco/tree/main).
TOON preprocessing uses a local encode-only implementation inspired by the MIT-licensed [TOON project](https://github.com/toon-format/toon) by Johann Schopplich, without adding `@toon-format/toon` as a runtime dependency.

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
| `history.max_items` | `number` | Maximum rendered history items. Overflow history is compacted into one preserved message rather than dropped. |

When runtime `history` exceeds `history.max_items`, PromptOpsKit creates one compacted history item for the older overflow and keeps the most recent turns. Applications can pass `onHistoryCompaction` to `renderPrompt()` or direct adapter rendering to produce their own summary message.

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
- `allow_regex`: allowlist validation before interpolation; accepts `/pattern/i`, `"pattern"`, or `{ pattern, flags, return_message? }`. Non-matches throw `POK031` unless `return_message` is configured.
- `deny_regex`: blocklist validation before interpolation; accepts `/pattern/i`, `"pattern"`, or `{ pattern, flags, return_message? }`. Matches throw `POK032` unless `return_message` is configured.
- `non_empty`: accepts `true` or `{ return_message }`; blank values throw `POK033` unless `return_message` is configured.
- `reject_secrets`: accepts `true` or `{ return_message }`; secret-like values throw `POK034` unless `return_message` is configured.

Prefer unquoted `/pattern/i` literal form for regex validators, especially when the pattern contains backslashes such as `\s` or `\b`. If you use structured `pattern:` form, use single-quoted YAML strings or double each backslash in double-quoted strings.

Malformed `allow_regex` and `deny_regex` values, including unsafe double-quoted YAML regex strings with raw backslashes, are reported during `validate` and `compile` with `POK013`.

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

Each environment/tier key maps to an overrides object. Overridable fields: `model`, `fallback_models`, `reasoning`, `sampling`, `response`, `compression`, `cache`, `raw`, `tools`, `provider_options`. See [Overrides](./overrides.md).

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
