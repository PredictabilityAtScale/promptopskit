---
name: promptopskit
description: Guidance for creating and editing promptopskit prompt files, defaults, variables, and validation-safe templates.
---

# promptopskit — Prompt Engineering Skill

This project uses **promptopskit** to manage LLM prompts as code.
Prompts live in markdown files with YAML front matter, are validated against
a schema, and render into provider-specific request bodies (OpenAI, Anthropic,
Gemini, OpenRouter, LLMAsAService, and OpenAI Responses). Follow these instructions when creating or editing prompts.

---

## User request intents

When a user asks for prompt work, infer their intent from phrasing and act directly.
Do not stop at explanation when the user is asking for a file or code artifact.

### Create a new prompt

Treat requests like these as instructions to create a new prompt markdown file:

- "Create a prompt that ..."
- "Add a prompt that ..."
- "Write a prompt for ..."
- "Make a prompt to ..."
- "Build me a prompt that ..."
- "I need a prompt that ..."
- "Scaffold a prompt for ..."
- "Create an eval/rewrite/classifier/extractor/summarizer prompt ..."

Behavior:

1. Create a new `kebab-case.md` file under the project's prompt source directory
   (`./prompts` by default, or the existing prompt folder used by the repo).
2. Give the file a meaningful name derived from the task, not a generic name like
   `prompt.md` or `new-prompt.md`.
3. Set `id` to a stable slash path or camel/snake identifier that matches local
   conventions. Prefer path-like ids such as `support/reply`,
   `content/seo-brief`, or `examples/basic` when prompts are organized in folders.
4. Include all appropriate defaults for the requested use case:
   - Always include `id` and `schema_version: 1`.
   - Include `description` when the purpose is not obvious from the id.
   - Include `provider` and `model` only if they are requested or not supplied by
     a nearby `defaults.md`.
   - Include `sampling`, `reasoning`, `response`, `tools`, `cache`,
      `provider_options`, or `raw` only when the prompt behavior requires them.
   - Include `compression` only when the prompt or data insertions explicitly need
     opt-in compression or code compaction.
   - Include `context.inputs` for every `{{ variable }}` in the body.
   - Use object-form inputs with `non_empty: true`, `max_size`, `trim`, and
     validation controls when the input is user-provided or unbounded.
   - Add `context.history.max_items` for chat or support prompts that should
     preserve bounded conversation history through compaction.
   - Add `# Notes` only for authoring details, examples, or explanations that
     must not be sent to the model.
5. If the prompt should return JSON or another structured result, define
   `response.format: json` and a JSON Schema in `response.schema`.
6. When the user gives a vague task, choose sensible placeholders and defaults
   from the task instead of asking for every detail. Ask only if the missing
   detail would change the prompt's purpose, provider, or output contract.
7. After writing the file, run or recommend `promptopskit validate` for the prompt
   source directory.

Example response to "Create a prompt that turns a support ticket into a concise triage summary":

```markdown
---
id: support/triage-summary
schema_version: 1
description: Summarize a support ticket for triage.
context:
  inputs:
    - name: ticket
      non_empty: true
      trim: true
      max_size: 12000
      reject_secrets: true
response:
  format: json
  schema_name: support_triage_summary
  schema:
    type: object
    additionalProperties: false
    required: [summary, urgency, category, next_action]
    properties:
      summary:
        type: string
      urgency:
        type: string
        enum: [low, medium, high]
      category:
        type: string
      next_action:
        type: string
---

# System instructions

You summarize support tickets for a triage queue. Be concise, specific, and avoid
inventing details that are not in the ticket.

# Prompt template

Summarize this support ticket:

{{ ticket }}
```

### Generate provider render code

Treat requests like these as instructions to generate code that renders a prompt
into a provider request body:

- "render the body for the prompt [name] for openai"
- "generate the body for [name] using anthropic"
- "create the call for prompt [name] for google"
- "convert prompt [name] to an openrouter request"
- "show me the OpenAI body for [name]"
- "generate the Anthropic call for the prompt [name]"
- "render/generate/build/create/produce the request/body/call/payload/messages
  for prompt [name] with provider [provider]"
- "turn [name] into a provider request for openai/anthropic/google/gemini/openrouter/llmasaservice"
- "wire up prompt [name] to OpenAI/Anthropic/Gemini/OpenRouter/LLMAsAService"
- "give me code to call [provider] with prompt [name]"

Provider aliases:

| User says | Use provider |
|-----------|--------------|
| `openai`, `chat completions`, `OpenAI chat` | `openai` |
| `responses`, `OpenAI Responses`, `responses api` | `openai-responses` |
| `anthropic`, `claude` | `anthropic` |
| `google`, `gemini` | `gemini` |
| `openrouter` | `openrouter` |
| `llmasaservice`, `llmasaservice.io`, `llm gateway` | `llmasaservice` |

Behavior:

1. Generate code unless the user explicitly asks for only the raw rendered JSON.
2. Prefer `createPromptOpsKit().renderPrompt()` for server-side app code that loads
   prompt source or compiled JSON by path.
3. Prefer provider adapters (`openaiAdapter`, `anthropicAdapter`,
   `geminiAdapter`, `openrouterAdapter`, `llmasaserviceAdapter`) when the user asks for provider-specific
   integration code or already has a compiled asset.
4. Include `variables` for every declared prompt input, using realistic placeholder
   values or function parameters.
5. Include `history` only if the prompt is chat-style or declares
   `context.history`.
6. Check `returnMessage` before reading `request` when using `kit.renderPrompt()`
   or `adapter.renderPrompt()`.
7. Return or pass `request.body` as the provider request payload; `request.provider`
   and `request.model` are metadata for the caller.
8. Do not put API keys in generated snippets. Use environment variables and keep
   provider calls on the server.

OpenAI example:

```typescript
import OpenAI from 'openai';
import { createPromptOpsKit } from 'promptopskit';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const kit = createPromptOpsKit({
  sourceDir: './prompts',
  compiledDir: './.generated-prompts/json',
  mode: 'auto',
});

const result = await kit.renderPrompt({
  path: 'support/triage-summary',
  provider: 'openai',
  variables: {
    ticket: ticketText,
  },
  strict: true,
});

if (result.returnMessage) {
  return result.returnMessage;
}
if (!result.request) {
  throw new Error('Prompt rendering did not produce an OpenAI request.');
}

const completion = await client.chat.completions.create(result.request.body as any);
```

Anthropic example:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createPromptOpsKit } from 'promptopskit';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const kit = createPromptOpsKit({ sourceDir: './prompts' });

const result = await kit.renderPrompt({
  path: 'support/triage-summary',
  provider: 'anthropic',
  variables: { ticket: ticketText },
  strict: true,
});

if (result.returnMessage) return result.returnMessage;
if (!result.request) throw new Error('Prompt rendering did not produce an Anthropic request.');

const message = await client.messages.create(result.request.body as any);
```

Google Gemini example:

```typescript
import { GoogleGenAI } from '@google/genai';
import { createPromptOpsKit } from 'promptopskit';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const kit = createPromptOpsKit({ sourceDir: './prompts' });

const result = await kit.renderPrompt({
  path: 'support/triage-summary',
  provider: 'gemini',
  variables: { ticket: ticketText },
  strict: true,
});

if (result.returnMessage) return result.returnMessage;
if (!result.request) throw new Error('Prompt rendering did not produce a Gemini request.');

const response = await ai.models.generateContent({
  model: result.request.model,
  ...(result.request.body as Record<string, unknown>),
});
```

OpenRouter example:

```typescript
import OpenAI from 'openai';
import { createPromptOpsKit } from 'promptopskit';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});
const kit = createPromptOpsKit({ sourceDir: './prompts' });

const result = await kit.renderPrompt({
  path: 'support/triage-summary',
  provider: 'openrouter',
  variables: { ticket: ticketText },
  strict: true,
});

if (result.returnMessage) return result.returnMessage;
if (!result.request) throw new Error('Prompt rendering did not produce an OpenRouter request.');

const completion = await client.chat.completions.create(result.request.body as any);
```

LLMAsAService example:

```typescript
import OpenAI from 'openai';
import {
  createLLMAsAServiceOpenAIConfig,
  llmasaserviceAdapter,
} from 'promptopskit/llmasaservice';

const client = new OpenAI(createLLMAsAServiceOpenAIConfig({
  apiKey: process.env.LLM_GATEWAY_API_KEY!,
  baseURL: process.env.LLM_GATEWAY_BASE_URL,
}));

const result = await llmasaserviceAdapter.renderPrompt(
  {
    path: 'support/triage-summary',
  },
  {
    llmasaservice: {
      apiKey: process.env.LLM_GATEWAY_API_KEY!,
    },
    runtime: {
      provider_options: {
        llmasaservice: {
          customer: {
            customer_id: customer.id,
            customer_name: customer.name,
            customer_user_id: user.id,
            customer_user_email: user.email,
          },
        },
      },
    },
    variables: { ticket: ticketText },
    strict: true,
  },
);

if (result.returnMessage) return result.returnMessage;
if (!('body' in result)) {
  throw new Error('Prompt rendering did not produce an LLMAsAService request.');
}

const completion = await client.chat.completions.create(result.body as any);
```

If the user asks for "just the body", render with `kit.renderPrompt()` and show
or return `result.request.body`, not the whole render result.

### Other useful promptopskit request examples

Handle these common requests with the same conventions:

- "Add defaults for this prompt folder" -> create or update `defaults.md` with
  shared `provider`, `model`, `metadata`, cache settings, and optional fallback
  `# System instructions`.
- "Add inputs to this prompt" -> add exact `context.inputs` entries for every
  placeholder and choose validation controls for risky or large values.
- "Make this prompt return JSON" -> add `response.format: json`,
  `response.schema_name`, and a strict `response.schema`.
- "Add a test for this prompt" -> create a sidecar `.test.yaml` with realistic
  `cases` and `variables`.
- "Compile/render/inspect/validate my prompts" -> use the matching
  `promptopskit` CLI command and report validation errors with file references.
- "Move common instructions into a reusable prompt" -> create a shared fragment
  and reference it with `includes`.
- "Add provider-specific options" -> prefer portable fields first, then
  `provider_options`, and use `raw` only for unmodeled vendor fields with a note.
- "Make this safe for production" -> add validation for untrusted inputs, keep API
  calls server-side, validate before compile, and avoid committing generated
  artifacts unless the project already does.

---

## Prompt file format

Every prompt is a `.md` file with two parts:

1. **YAML front matter** — model settings, provider config, variables, overrides
2. **Markdown body** — sections separated by H1 headings

### Minimal example

```markdown
---
id: greeting
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - name: name
      max_size: 2000
---

# System instructions

You are a helpful assistant.

# Prompt template

Hello {{ name }}, how can I help you?
```

When creating a new prompt file with "just the necessary fields", include only
the fields required by that specific file:
- Always include `id` and `schema_version: 1`
- Include `provider` and `model` only if they are not inherited from `defaults.md`
- Include `context.inputs` whenever the body contains `{{ variable }}` placeholders
- Omit `context` entirely only when the body has no placeholders

---

## Front matter reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | **yes** | Unique identifier for the prompt |
| `schema_version` | number | yes | Always `1` |
| `description` | string | no | Human-readable description |
| `provider` | enum | no | `openai`, `openai-responses`, `anthropic`, `google`, `gemini`, `openrouter`, `llmasaservice`, or `any` |
| `model` | string | no | Model identifier (e.g. `gpt-5.4`, `claude-sonnet-4-20250514`) |
| `fallback_models` | string[] | no | Ordered fallback model list |
| `reasoning` | object | no | `{ effort: low|medium|high, budget_tokens: number }` |
| `sampling` | object | no | `{ temperature, top_p, frequency_penalty, presence_penalty, stop, max_output_tokens }` |
| `response` | object | no | `{ format: text|json|markdown, stream: boolean, schema?: object, schema_name?: string, schema_description?: string, schema_strict?: boolean }` |
| `compression` | object | no | Prompt-template compression controls: `thetokencompany`, local `heuristic`, or local `code` compaction |
| `cache` | object | no | Provider-specific cache controls (`openai`, `anthropic`, `gemini`/`google`) |
| `tools` | array | no | Tool names (strings) or inline definitions with `{ name, description, input_schema }` |
| `provider_options` | object | no | Provider-specific advanced options (`anthropic`, `gemini`, `openrouter`, `llmasaservice`) |
| `raw` | object | no | Provider-scoped request-body passthrough for unmodeled vendor fields |
| `mcp` | object | no | `{ servers: [string | { name, config }] }` |
| `context.inputs` | `Array<string | { name, optional?, warnings?, max_size?, trim?, allow_regex?, deny_regex?, non_empty?, reject_secrets?, compression? }>` | no | Declared variable names used in templates, with optionality, warning controls, size budgets, runtime hardening controls, and optional per-input compression |
| `context.history` | object | no | `{ max_items: number }`; caps rendered history by compacting older turns into one preserved message |
| `includes` | string[] | no | Relative paths to other prompt files to include |
| `environments` | object | no | Per-environment overrides (see Overrides) |
| `tiers` | object | no | Per-tier overrides (see Overrides) |
| `metadata` | object | no | `{ owner, tags, review_required, stable }` |

---

## Sections (markdown body)

Use H1 headings to define sections. The parser recognizes these headings
(case-insensitive):

| Heading | Maps to | Purpose |
|---------|---------|---------|
| `# System instructions` | `system_instructions` | System/developer message |
| `# Prompt template` | `prompt_template` | User message template |
| `# Notes` | `notes` | Documentation only — not sent to the model |

If the body has **no H1 headings**, the entire body becomes the `prompt_template`.

---

## Variable interpolation

Use `{{ variable_name }}` syntax in system instructions and prompt template
sections. Variables are replaced at render time.

Rules:
- Declare all variables in `context.inputs` — validation warns on undeclared usage
- Before finishing a new prompt file, scan the body for every `{{ variable }}` and
  ensure each exact variable name appears in `context.inputs`
- Use object-form inputs with `max_size` when a variable is likely to grow large and should trigger early warnings
- Use `optional: true` when a variable may be absent; strict rendering will not throw for that missing variable
- Use `warnings: false` sparingly for intentional exceptions that should not emit input-scoped validation or size warnings
- Use `trim` to enforce byte budgets before interpolation when `max_size` is set
- Use `allow_regex` for allowlist checks and `deny_regex` for blocklist checks on risky inputs
- Prefer unquoted `/pattern/i` literals for regex validators so backslash escapes such as `\s` and `\b` stay copyable from regex tools
- Use structured regexes like `{ pattern, flags, return_message }` when the validator needs a fallback message or separate flags
- In structured `pattern:` YAML, use single quotes for patterns with backslashes or double each backslash in double-quoted strings
- Use `non_empty: true` for required user text and `reject_secrets: true` for common secret redaction checks
- When the caller should receive a structured fallback message instead of an exception, use object form with `return_message` on `allow_regex`, `deny_regex`, `non_empty`, or `reject_secrets`
- Escape literal braces with `\{{` and `\}}`
- In strict mode, missing variables throw an error
- In permissive mode, unresolved placeholders are left intact
- Compression modifiers are single-token opt-ins: `{{ text | compress }}`,
  `{{ json_payload | toon }}`, `{{ source_code | compact }}`, or
  `{{ source_code | code }}`

Example with a size budget:

```yaml
context:
  inputs:
    - user_message
    - name: account_summary
      max_size: 4096
```

If a rendered value exceeds `max_size`, `renderPrompt()` emits a non-blocking `POK030` warning unless the input sets `warnings: false`.
At render time, callers can also pass `onContextOverflow` to transform oversized values before warnings/rendering.

If a validator declares `return_message`, `renderPrompt()` returns that message in a structured result and omits the provider request instead of throwing for that validation failure. Invalid regex definitions still fail during `validate` and `compile` as `POK013` prompt-authoring errors.

Malformed `allow_regex` and `deny_regex` values fail during `validate` and `compile`, not just at render time. When regex compilation fails, the error includes the prompt id, variable name, field name, and raw configured value. Double-quoted YAML regex strings with raw backslashes fail as `POK013`; use `/pattern/i`, single-quoted `pattern: '...'`, or doubled backslashes.

### Prompt and data compression

Compression is always opt-in. Add it only when a prompt template or a specific
data insertion is large enough to justify changing the rendered prompt. Do not
compress system instructions or small inputs by default.

Use `compression.thetokencompany` when the rendered `# Prompt template` should
be compressed by TheTokenCompany before provider request generation:

```yaml
compression:
  thetokencompany:
    enabled: true
    model: bear-2
    aggressiveness: 0.2
```

Runtime callers must pass `theTokenCompany.apiKey` or provide
`THETOKENCOMPANY_API_KEY`/`TTC_API_KEY`. TheTokenCompany compression is the only
compression mode that makes a backend call.

Use local heuristic compression when the prompt template is prose or natural
language context and no backend call should be made:

```yaml
compression:
  heuristic:
    enabled: true
    mode: conservative
    min_tokens: 120
    max_sentences: 8
    target_reduction: 0.45
    query_variable: user_question
```

The heuristic compressor deduplicates adjacent repeated sentences, ranks exact
source sentences against `query`, `query_variable`, or system instructions, and
keeps the highest-scoring sentences inside the token budget. The default
`mode: conservative` skips low-confidence compression, preserves adjacent
context when `max_sentences` allows, avoids token-level truncation, and leaves
structured blocks unchanged. It is heuristic, so use it for context where
extractive reduction is acceptable, not for code or strict structured payloads.

Use TOON preprocessing for complete JSON object/array inputs:

```yaml
compression:
  heuristic:
    enabled: true
    json_to_toon: true
```

For one JSON insertion, prefer the placeholder modifier:

```markdown
Payload:
{{ json_payload | toon }}
```

If `json_to_toon: true` or `{{ value | toon }}` cannot parse a complete JSON
object or array, PromptOpsKit preserves the original value and returns a
`POK031` warning instead of sentence-compressing broken JSON.

Use code compaction for code. Do not text-compress code:

```yaml
compression:
  code:
    enabled: true
    remove_comments: true
    trim_indentation: true
    collapse_blank_lines: true
```

For one code insertion:

```markdown
Source:
{{ source_code | compact }}
```

Code compaction removes comments, common indentation, trailing whitespace, and
blank lines by default. Set `remove_comments: false` when comments carry
semantics, such as compiler pragmas, generated-code markers, or `@ts-ignore`.
When prompt-level `compression.code.enabled: true`, PromptOpsKit skips
TheTokenCompany compression and returns `POK033` so code is not backend
text-compressed.

Context inputs can opt in through schema:

```yaml
context:
  inputs:
    - name: account_context
      compression:
        heuristic:
          enabled: true
          mode: conservative
          query_variable: user_question
    - name: payload
      compression:
        heuristic:
          enabled: true
          json_to_toon: true
    - name: source_code
      compression: code
```

Or at the placeholder call site:

```markdown
Context: {{ account_context | compress }}
Payload: {{ payload | toon }}
Source: {{ source_code | compact }}
```

Placeholder modifiers are single-token shortcuts. Use
`context.inputs[].compression` when a placeholder needs options such as
`query_variable`, `mode`, `preserve_neighbors`, `fail_on_low_confidence`,
`json_to_toon`, or `remove_comments: false`.

Render results may include:

```typescript
result.compression;        // per-step details
result.compressionSummary; // operation-level aggregate
result.warnings;           // includes POK031/POK032/POK033 compression warnings
```

Treat `compressionSummary.tokensSaved` as an operation-level aggregate across
all compression and compaction steps, not a guaranteed net request-token delta.
Use `result.compression` for the per-placeholder or per-provider breakdown.

Credit the source projects when documenting compression: the local
token-compression approach is based on Jason Kneen's
[open-thetokenco](https://github.com/jasonkneen/open-thetokenco/tree/main).
TOON preprocessing uses a local encode-only implementation inspired by the
MIT-licensed [TOON project](https://github.com/toon-format/toon) by Johann
Schopplich.

### Conversation history limits

Use `context.history.max_items` when a chat-style prompt should bound rendered conversation history:

```yaml
context:
  history:
    max_items: 10
```

When runtime `history` exceeds `max_items`, PromptOpsKit preserves history by compacting older turns into one synthetic history message and keeping the most recent turns. Callers can provide `onHistoryCompaction` to create a custom summary:

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

If no callback is supplied, PromptOpsKit creates a plain text compacted history message. Do not describe `max_items` as dropping history; it preserves overflow through compaction.

Example: this is the minimal valid shape for a prompt that references
`{{ pull_request }}` even when provider/model are inherited from defaults:

```markdown
---
id: summarizePullRequest
schema_version: 1
context:
  inputs:
    - pull_request
---

# Prompt template

Summarize the following pull request:

{{ pull_request }}
```

---

## Includes (composition)

Compose prompts from shared fragments:

```yaml
includes:
  - ./shared/tone.md
  - ./shared/safety.md
```

Included files are parsed and their `system_instructions` are **prepended**
before the including file's own system instructions. Includes resolve
recursively. Circular includes are detected and rejected.

> **Note:** Included files do not inherit folder defaults. Only the top-level
> prompt that is loaded via `loadPromptFile` receives defaults.

---

## Folder defaults (`defaults.md`)

Define shared defaults for a prompt tree by adding a `defaults.md` file in any
folder:

```text
prompts/
├── defaults.md          # global provider, model, options, metadata + system instructions
└── support/
    ├── defaults.md      # overrides for support/*
    └── reply.md         # inherits from support/defaults.md
```

Supported default fields:
- `provider`, `model`, `fallback_models` (front matter) — default routing
- `reasoning`, `sampling`, `response` (front matter) — default model behavior
- `cache`, `provider_options`, `raw` (front matter) — default provider-specific options
- `tools`, `mcp`, `context`, `includes` (front matter) — default bindings and input/include configuration
- `environments`, `tiers` (front matter) — default override maps
- `metadata` (front matter) — merged with prompt-local metadata
- `# System instructions` (body section) — used when the prompt has none

This lets you configure app-wide settings like `provider` and `model`
in a single root `defaults.md`, so individual prompts only declare what's unique to them.

Important: use shared `context.inputs` in `defaults.md` only when every prompt
under that folder uses the same placeholders. Prompt-local `context.inputs`
replace the inherited array.

Rules:
- Nearest subfolder `defaults.md` overrides parent defaults
- Prompt-local values always take precedence over defaults
- Inherited `includes` are authored relative to the `defaults.md` file that declares them
- `defaults.md` files are skipped during compilation and validation
- `loadPromptFile` defaults the search boundary to the file's own directory;
  pass `defaultsRoot` to enable ancestor traversal

---

## Environment & tier overrides

Override model settings per environment or tier:

```yaml
environments:
  development:
    model: gpt-4.1-mini
    reasoning:
      effort: low
    sampling:
      temperature: 0.9
  production:
    model: gpt-5.4
    reasoning:
      effort: high
    sampling:
      temperature: 0.3

tiers:
  free:
    model: gpt-4.1-mini
    sampling:
      max_output_tokens: 500
  premium:
    model: gpt-5.4
```

Overridable fields: `model`, `fallback_models`, `reasoning`, `sampling`,
`response`, `cache`, `raw`, `tools`, `provider_options`.

Override application order: **base → environment → tier → runtime**.

---

## Provider-specific fields

Prefer portable fields first:

- Use `sampling` for common sampling controls
- Use `response.schema`, `response.schema_name`, `response.schema_description`, and `response.schema_strict` for structured output when possible
- Use `cache` for provider cache hints
- Use `tools` for tool definitions

Treat `response.schema` as the provider-neutral JSON Schema contract. The adapters emit it through provider-specific request fields: OpenAI/OpenRouter/LLMAsAService `response_format`, OpenAI Responses `text.format`, Anthropic `output_config.format`, and Gemini `generationConfig.responseJsonSchema`.

Use `provider_options` for known non-portable mappings:

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
    # Use only when Gemini's native schema dialect is required.
    response_schema:
      type: object
    response_json_schema:
      type: object
  openrouter:
    provider:
      order: ["anthropic", "openai"]
    transforms: ["middle-out"]
  llmasaservice:
    # Optional default; usually pass the real customer at render time.
    customer:
      customer_id: cust_123
      customer_name: Acme
```

For LLMAsAService, pass the server-owned gateway credential through `llmasaservice.apiKey`; the adapter emits `Authorization: Bearer <api-key>`. Prefer putting the current customer/account/user attribution in `runtime.provider_options.llmasaservice.customer` during rendering. Static prompt metadata may include a default, but runtime values should override it for real requests. Do not require or generate a project id.

Use `raw` only when a vendor request-body field is important and PromptOpsKit does not model it yet:

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

Raw blocks are provider-scoped (`openai`, `openai-responses`/`openai_responses`, `anthropic`, `gemini`/`google`, `openrouter`, `llmasaservice`) and are shallow-merged into the final request body after normalized fields. When adding `raw`, include a short note in `# Notes` explaining why a first-class field is not being used.

---

## Test sidecars

Create a `.test.yaml` file alongside a prompt to define test cases:

```yaml
# greeting.test.yaml
cases:
  - name: basic
    variables:
      name: "World"
  - name: formal
    variables:
      name: "Dr. Smith"
```

---

## Runtime choice guide

Choose the narrowest runtime surface that fits the environment.

### Use `createPromptOpsKit().renderPrompt()` when:

- You are on the server or in a Node runtime
- Prompts live as `.md` files in a source tree
- You want promptopskit to handle loading, defaults, includes, overrides, and provider shaping in one step
- You want auto mode to prefer compiled artifacts when present but still fall back to source

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit({
  sourceDir: './prompts',
  compiledDir: './.generated-prompts/json',
  warnings: {
    contextSize: process.env.NODE_ENV === 'production' ? 'off' : 'console-and-result',
  },
});

const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  environment: 'production',
  variables: {
    user_message: 'How do I reset my password?',
    app_context: 'Account settings',
  },
});

if (result.returnMessage) {
  return result.returnMessage;
}

if (!result.request) {
  throw new Error('Prompt rendering did not produce a provider request.');
}

const { request } = result;

if (result.compressionSummary) {
  console.log('Compression savings:', result.compressionSummary.tokensSaved);
}

for (const warning of result.warnings) {
  console.warn(warning);
}
```

### Use `adapter.renderPrompt()` when:

- You want direct provider adapter imports such as `promptopskit/openai`
- You are on the server and want adapter-level ergonomics
- You still want the adapter to resolve either source `.md` or compiled output from disk

```typescript
import path from 'node:path';
import { openaiAdapter } from 'promptopskit/openai';

const result = await openaiAdapter.renderPrompt(
  {
    path: 'support/reply',
    sourceDir: path.join(process.cwd(), 'prompts'),
    compiledDir: path.join(process.cwd(), '.generated-prompts', 'json'),
  },
  {
    environment: 'production',
    variables: {
      user_message: 'How do I reset my password?',
      app_context: 'Account settings',
    },
    strict: true,
  },
);

if (result.returnMessage) {
  return result.returnMessage;
}

if (!('body' in result)) {
  throw new Error('Prompt rendering did not produce a provider request.');
}

const request = result;
```

### Use `adapter.render()` when:

- You already have a compiled JSON or ESM prompt artifact
- You are in edge, worker, or browser-oriented code and cannot read prompt files from disk
- You want the smallest runtime surface and no file loading behavior

```typescript
import type { ResolvedPromptAsset } from 'promptopskit';
import { openaiAdapter } from 'promptopskit/openai';
import compiledPrompt from './.generated-prompts/esm/support/reply.mjs';

const prompt = compiledPrompt as ResolvedPromptAsset;

const request = openaiAdapter.render(prompt, {
  environment: 'production',
  variables: {
    user_message: 'How do I reset my password?',
    app_context: 'Account settings',
  },
  strict: true,
});
```

### Browser guidance

- Do not recommend direct provider API calls from browser or client components unless the user explicitly wants a demo-only setup
- Do not use `createPromptOpsKit()` in browser-only code; it is Node-oriented
- For client-side rendering, use precompiled ESM or inline a small `ResolvedPromptAsset`, then pass the request body to a server endpoint or server action that holds provider credentials
- If the user insists on a pure browser provider call, explicitly call out that API keys will be exposed and treat it as unsafe for production

---

## Build integration

Prompts should usually be validated and compiled as part of the normal build pipeline rather than handled ad hoc.

### Recommended package.json scripts

```json
{
  "scripts": {
    "validate:prompts": "promptopskit validate ./prompts --strict",
    "build:prompts": "promptopskit compile",
    "build": "npm run validate:prompts && npm run build:prompts && tsup"
  }
}
```

`promptopskit compile` defaults to JSON output in `./.generated-prompts/json`, which matches runtime `compiledDir` loading. Use `promptopskit compile --format esm` when prompts need to be imported into a bundle; those artifacts default to `./.generated-prompts/esm`.

### Build strategy by environment

- Node server: compile to JSON and configure `compiledDir`
- Browser or client bundle: compile to ESM and import specific prompt artifacts
- Mixed app: compile JSON for server loading and ESM only for prompts that must ship in a client bundle

### What to tell users when setting this up

- Add `validate:prompts` before `build:prompts` so schema or variable mistakes fail fast
- Treat compiled artifacts as build outputs, not the source of truth
- Keep prompt source in `./prompts`; use `./.generated-prompts/json` as the default server output and `./.generated-prompts/esm` for imported client artifacts unless a project-specific build layout needs something else
- If using `createPromptOpsKit` in `auto` mode, point both `sourceDir` and `compiledDir` at those directories so local development can fall back to source when artifacts are stale or missing

### Typical server-side setup

```typescript
import { createPromptOpsKit } from 'promptopskit';

export const prompts = createPromptOpsKit({
  sourceDir: './prompts',
  compiledDir: './.generated-prompts/json',
  mode: 'auto',
});
```

### Typical client-side setup

```typescript
import type { ResolvedPromptAsset } from 'promptopskit';
import compiledPrompt from './generated/prompts/support/reply.mjs';

const prompt = compiledPrompt as ResolvedPromptAsset;
```

---

## Validation and testing helpers

Use `validateAsset()` when you are working with an already-parsed asset and want schema or variable diagnostics before rendering.

```typescript
import { validateAsset, parsePrompt } from 'promptopskit';

const asset = parsePrompt(source);
const result = validateAsset(asset);

if (!result.valid) {
  console.error(result.errors);
}
```

Use `promptopskit/testing` helpers for unit tests around prompt behavior or request shaping.

```typescript
import { createMockAsset, parseTestPrompt } from 'promptopskit/testing';

const mock = createMockAsset({ model: 'gpt-4.1-mini' });

const asset = parseTestPrompt(`
---
id: test
schema_version: 1
provider: openai
model: gpt-5.4
---

# Prompt template

Hello {{ name }}
`);
```

---

## CLI commands

| Command | Description |
|---------|-------------|
| `promptopskit init [dir]` | Scaffold a prompts directory with starter files (including `defaults.md`) |
| `promptopskit validate [sourceDir] [options]` | Validate all prompt files in a directory, defaulting to `./prompts` |
| `promptopskit compile [src] [out]` | Compile `.md` prompts to JSON or ESM artifacts |
| `promptopskit render <file>` | Render a prompt preview |
| `promptopskit inspect <file>` | Print the normalized prompt asset |

---

## Conventions to follow

1. **One prompt per file** — each `.md` file is a single prompt asset
2. **Always set `id` and `schema_version: 1`** unless a surrounding tool explicitly generates those fields
3. **Declare every placeholder** in `context.inputs`; use `defaults.md` only for input declarations that apply to every prompt under that folder
4. **Use `defaults.md` for shared provider, model, provider options, metadata, and fallback system instructions**
5. **Use includes for reusable system behavior**, not for user-specific prompt bodies
6. **Prefer `createPromptOpsKit().renderPrompt()` for server-side app code** when prompts live as source files
7. **Prefer direct adapters for compiled assets or provider-specific integration points**
8. **Do not suggest browser-side provider calls for production** because credentials belong on the server
9. **Validate before compile and compile before shipping** when prompts are part of the build
10. **Variable names** should be `snake_case`
11. **Prompt file names** should be `kebab-case.md`
12. **Compression must stay opt-in** through `compression` config or placeholder modifiers
13. **Use TOON for complete JSON payloads** and code compaction for code; do not text-compress code
