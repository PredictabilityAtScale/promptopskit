# Prompt Format

Every prompt is a Markdown file with two parts: **YAML front matter** for settings and **H1 headings** that separate the body into named sections.

## Structure

```markdown
---
id: support/reply
schema_version: 1
provider: openai
model: gpt-5.4
sampling:
  temperature: 0.7
context:
  inputs:
    - user_message
---

# System instructions

You are a helpful support assistant.

# Prompt template

{{ user_message }}

# Notes

Internal notes — ignored by the renderer.
```

## Front matter

The YAML block between `---` delimiters defines model settings, provider, sampling parameters, tools, overrides, and metadata. See the [Schema](./schema.md) page for every supported field.

Required fields:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the prompt (e.g. `support/reply`) |
| `schema_version` | Schema version — currently `1` |

## Folder defaults (`defaults.md`)

You can define shared defaults for an entire prompt tree by adding a `defaults.md` file in any folder.

- `defaults.md` values apply to all prompts in that folder and subfolders.
- Subfolders can define their own `defaults.md`; nearest (most local) values win.
- Only missing prompt values are filled from defaults (explicit prompt values always take precedence).
- Included files (`includes`) are **not** affected by folder defaults — only the top-level prompt inherits.

Supported default fields:

- `provider`, `model`, and `fallback_models` (front matter) — default provider and model routing for the folder
- `reasoning`, `sampling`, and `response` (front matter) — default model behavior
- `compression`, `cache`, `provider_options`, and `raw` (front matter) — default provider-specific request options
- `tools`, `mcp`, `context`, and `includes` (front matter) — default tool bindings, server references, input rules, and shared includes
- `environments` and `tiers` (front matter) — default override maps that prompt-local maps can extend
- `metadata` (front matter) — merged with prompt-local metadata
- `# System instructions` (body section) — used when the prompt has none

This lets you configure app-wide settings like `provider` and `model` in a single place. Individual prompts only need to declare what's unique to them.

Scalars and arrays are replaced by nearer values. Object blocks are shallow-merged, including provider sub-blocks such as `provider_options.llmasaservice`, `compression.thetokencompany`, and `cache.openai`, so a local prompt can override one field without restating the whole block.

Inherited `includes` are written relative to the `defaults.md` file that declares them and are normalized for the prompt that inherits them.

Example:

```text
prompts/
├── defaults.md          # global settings, metadata + system instructions
└── support/
    ├── defaults.md      # overrides for support/*
    └── reply.md         # inherits from support/defaults.md
```

`prompts/defaults.md`:

```markdown
---
provider: openai
model: gpt-5.4
cache:
  openai:
    prompt_cache_key: support-v1
    retention: in_memory
provider_options:
  llmasaservice:
    project_id: 39a5e4a0-681c-463d-ae7b-bca25d4487ae
metadata:
  owner: platform
  review_required: true
---

# System instructions

Follow company-wide safety policy.
```

`prompts/support/defaults.md`:

```markdown
---
metadata:
  owner: support
---

# System instructions

Use support tone and escalation policy.
```

`prompts/support/reply.md` (no local `metadata.owner` and no local system section) will use:
- `provider: openai` (inherited from root defaults)
- `model: gpt-5.4` (inherited from root defaults)
- `cache.openai.prompt_cache_key: support-v1` (inherited from root defaults)
- `provider_options.llmasaservice.project_id` (inherited from root defaults)
- `metadata.owner: support` (nearest override)
- `metadata.review_required: true` (inherited from parent defaults)
- system instructions from `support/defaults.md`

## Prompt template compression

Use `compression.thetokencompany` when a prompt should call TheTokenCompany before generating the provider request:

```yaml
compression:
  thetokencompany:
    enabled: true
    model: bear-2
    aggressiveness: 0.2
```

When enabled, PromptOpsKit interpolates the `# Prompt template`, sends that rendered text directly to `POST https://api.thetokencompany.com/v1/compress`, and uses the returned `output` as the user prompt before provider cache settings are applied. System instructions and conversation history are not compressed.

Callers must supply their own TheTokenCompany API key:

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables,
  theTokenCompany: {
    apiKey: process.env.THETOKENCOMPANY_API_KEY,
  },
});
```

You can set `compression.thetokencompany.enabled: false` on a prompt, environment, tier, or runtime override to disable inherited compression, or override `aggressiveness` per template/tier.

## Caching configuration

Use the optional `cache` front matter block to pass vendor-specific caching hints:

```yaml
cache:
  openai:
    prompt_cache_key: support-v2
    retention: 24h
  anthropic:
    mode: automatic
    ttl: 5m
  gemini:
    cached_content: cachedContents/1234567890
```

- `openai.prompt_cache_key` and `openai.retention` map to OpenAI prompt caching fields.
- `anthropic.mode: automatic` sets top-level `cache_control`; `explicit` applies block-level cache controls to configured sections/tools.
- `gemini.cached_content` (or `google.cached_content`) maps to `cachedContent` for requests that reuse a previously created Gemini cache.
- You can safely include multiple provider blocks in the same prompt. Each adapter only reads its own block (`openai`, `anthropic`, `gemini`/`google`, `openrouter`, or `llmasaservice`) and ignores the others.

## Structured JSON output

Use the neutral `response` block for structured JSON whenever possible:

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

Adapters emit this JSON Schema through the provider-specific body shape: OpenAI/OpenRouter/LLMAsAService `response_format`, OpenAI Responses `text.format`, Anthropic `output_config.format`, and Gemini `generationConfig.responseJsonSchema`.

Use provider-specific schema fields only when the vendor dialect itself matters, such as `provider_options.gemini.response_schema` for Gemini's native schema form.

## Raw provider passthrough

Use `raw` when a provider supports a request-body field that PromptOpsKit does not expose yet:

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
  openrouter:
    usage:
      include: true
  llmasaservice:
    conversationId: conv_123
```

Each adapter reads only its own raw block. Raw values are shallow-merged into the generated body after normalized mappings, so they can override generated fields. Prefer normalized fields (`sampling`, `response`, `compression`, `cache`, `tools`) and `provider_options` first; reserve `raw` for vendor-specific fields that would otherwise be impossible to send.

## Sections

The Markdown body is split on **H1 headings** into named sections. Three section names are recognized (case-insensitive):

| Heading | Key | Purpose |
|---------|-----|---------|
| `# System instructions` | `system_instructions` | System message sent to the model |
| `# Prompt template` | `prompt_template` | User message template with variables |
| `# Notes` | `notes` | Internal documentation — not rendered |

Rules:

- H2 and deeper headings inside a section are treated as content, not as section boundaries.
- If no H1 headings are found, the entire body is treated as `prompt_template`.
- Both `# System instructions` and `# Prompt template` are optional — but at least one must exist for the prompt to be valid.

## Variables

Use `{{ mustache }}` syntax for variable interpolation:

```markdown
# Prompt template

Hello {{ name }}, welcome to {{ company }}.
Runtime context: {{ app_context }}.
```

Variable names must match `[a-zA-Z_][a-zA-Z0-9_]*`.

### Strict vs. permissive mode

| Mode | Behavior on missing variable |
|------|-----|
| **Permissive** (default) | Leaves `{{ placeholder }}` intact in the output |
| **Strict** | Throws an error |

Enable strict mode by passing `strict: true` to `renderPrompt()`.

### Escaping

To produce a literal `{{` in the output, escape it:

```markdown
Use \{\{ to write template syntax.
```

### Declaring inputs

Declare expected variables in `context.inputs` for validation:

```yaml
context:
  inputs:
    - name
    - company
    - name: app_context
      max_size: 2000
    - name: experiment_note
      optional: true
      warnings: false
```

Each entry can be either a string variable name or an object with:

- `name` — the template variable name
- `optional` — set `true` when the variable may be omitted; strict rendering will leave the placeholder intact instead of throwing
- `warnings` — set `false` to suppress static validation warnings and render-time `POK030` size warnings for that input
- `max_size` — optional UTF-8 byte limit for the injected value
- `trim` — optional trim-to-budget (`true`/`end` keeps first bytes, `start` keeps trailing bytes) applied when `max_size` is set
- `allow_regex` — optional allowlist regex; accepts `/pattern/i`, `"pattern"`, or `{ pattern, flags, return_message? }` and throws `POK031` on mismatch unless `return_message` is configured
- `deny_regex` — optional blocklist regex; accepts `/pattern/i`, `"pattern"`, or `{ pattern, flags, return_message? }` and throws `POK032` on match unless `return_message` is configured
- `non_empty` — optional boolean or object validator; use `true` to throw `POK033`, or `{ return_message }` to short-circuit rendering with a structured message
- `reject_secrets` — optional boolean or object validator; use `true` to throw `POK034`, or `{ return_message }` to short-circuit rendering with a structured message

The validator warns about:
- Variables used in templates but not declared in `context.inputs`
- Variables declared in `context.inputs` but never used

Use `optional: true` for object-form inputs that are legitimately absent in some renders. Optional inputs are not treated as required by strict interpolation and do not produce unused-input or missing-hardening warnings. Use `warnings: false` only for intentional exceptions; it suppresses warnings scoped to that input but does not suppress schema errors, invalid regex errors, or runtime validation failures.

At render time, PromptOpsKit also emits a non-blocking `POK030` warning when a provided variable exceeds its declared `max_size`. In source and auto modes, the warning is also written to `console.warn` to make local development issues visible early.

Malformed `allow_regex` and `deny_regex` values fail during `validate` and `compile` with `POK013`, so bad patterns are caught before runtime. Double-quoted YAML regex strings with raw backslashes are also reported as `POK013`; use unquoted `/pattern/i`, single-quoted `pattern: '...'`, or doubled backslashes in double quotes.

### Conversation history

Declare `context.history.max_items` when a prompt should bound rendered conversation history:

```yaml
context:
  history:
    max_items: 8
```

When runtime `history` has more than `max_items` messages, PromptOpsKit preserves all history by compacting older turns into one synthetic history message, then keeping the most recent turns. The final provider request receives at most `max_items` history items before the current prompt template is added.

Callers can customize the compacted message with `onHistoryCompaction`:

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  history,
  onHistoryCompaction: ({ overflow }) => ({
    role: 'user',
    content: `Earlier conversation summary: ${summarizeConversationUsingLLM(overflow)}`,
  }),
});
```

If no callback is supplied, PromptOpsKit creates a plain text compacted history message. This behavior is provider-agnostic: OpenAI/OpenRouter/LLMAsAService use `messages`, OpenAI Responses uses `input`, Anthropic uses `messages`, and Gemini maps assistant history to `model`.

Example hardened input definition:

```yaml
context:
  inputs:
    - name: user_id
      trim: true
      max_size: 24
      allow_regex:
        pattern: '^user_[a-z0-9]+$'
        flags: 'i'
        return_message: 'User IDs must use the user_123 format.'
    - name: pull_request_body
      non_empty:
        return_message: 'Pull request content is required.'
      reject_secrets: true
      deny_regex: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|(?:^|\b)(?:system|developer|assistant)\s*:|reveal\s+(?:your|the)\s+(?:system\s+prompt|hidden\s+instructions?)|print\s+(?:the\s+)?(?:policy|rules?)|BEGIN\s+SYSTEM\s+PROMPT|END\s+SYSTEM\s+PROMPT/i
```

Prefer unquoted `/pattern/i` literal form for regex patterns that contain backslashes. If you use a structured `pattern` field, use single-quoted YAML strings or double each backslash in double-quoted strings.

## Minimal example

The simplest valid prompt:

```markdown
---
id: greet
schema_version: 1
---

Hello {{ name }}!
```

No H1 headings — the body becomes the `prompt_template` section automatically.

## Full example

A production-ready prompt using all major features:

```markdown
---
id: support/reply
schema_version: 1
provider: openai
model: gpt-5.4
fallback_models:
  - gpt-5.4-mini
reasoning:
  effort: medium
sampling:
  temperature: 0.7
  max_output_tokens: 2048
response:
  format: json
  schema_name: support_reply
  schema_description: Structured support reply
  schema:
    type: object
    properties:
      answer:
        type: string
    required:
      - answer
provider_options:
  openrouter:
    transforms:
      - middle-out
  llmasaservice:
    project_id: llm-project-id
    customer:
      customer_id: cust_123
context:
  inputs:
    - user_message
    - name: account_summary
      max_size: 8000
  history:
    max_items: 8
tools:
  - get_account_status
compression:
  thetokencompany:
    enabled: true
    aggressiveness: 0.2
cache:
  openai:
    prompt_cache_key: support-reply-v1
    retention: in_memory
includes:
  - ../shared/tone.md
environments:
  dev:
    model: gpt-5.4-mini
    reasoning:
      effort: low
  prod:
    model: gpt-5.4
tiers:
  free:
    model: gpt-5.4-mini
  pro:
    model: gpt-5.4
raw:
  openai:
    service_tier: flex
metadata:
  owner: support-platform
  review_required: true
---

# System instructions

You are a careful support assistant. Follow refund policy exactly.

# Prompt template

Customer message:
{{ user_message }}

Account summary:
{{ account_summary }}
```
