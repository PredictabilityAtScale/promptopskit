---
name: promptopskit
description: Guidance for creating and editing promptopskit prompt files, defaults, variables, and validation-safe templates.
---

# promptopskit — Prompt Engineering Skill

This project uses **promptopskit** to manage LLM prompts as code.
Prompts live in markdown files with YAML front matter, are validated against
a schema, and render into provider-specific request bodies (OpenAI, Anthropic,
Gemini, OpenRouter, and OpenAI Responses). Follow these instructions when creating or editing prompts.

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
| `provider` | enum | no | `openai`, `openai-responses`, `anthropic`, `google`, `gemini`, `openrouter`, or `any` |
| `model` | string | no | Model identifier (e.g. `gpt-5.4`, `claude-sonnet-4-20250514`) |
| `fallback_models` | string[] | no | Ordered fallback model list |
| `reasoning` | object | no | `{ effort: low|medium|high, budget_tokens: number }` |
| `sampling` | object | no | `{ temperature, top_p, frequency_penalty, presence_penalty, stop, max_output_tokens }` |
| `response` | object | no | `{ format: text|json|markdown, stream: boolean, schema?: object, schema_name?: string, schema_description?: string, schema_strict?: boolean }` |
| `cache` | object | no | Provider-specific cache controls (`openai`, `anthropic`, `gemini`/`google`) |
| `tools` | array | no | Tool names (strings) or inline definitions with `{ name, description, input_schema }` |
| `provider_options` | object | no | Provider-specific advanced options (`anthropic`, `gemini`, `openrouter`) |
| `raw` | object | no | Provider-scoped request-body passthrough for unmodeled vendor fields |
| `mcp` | object | no | `{ servers: [string | { name, config }] }` |
| `context.inputs` | `Array<string | { name, max_size?, trim?, allow_regex?, deny_regex?, non_empty?, reject_secrets? }>` | no | Declared variable names used in templates, with optional size budgets and runtime hardening controls |
| `context.history` | object | no | `{ max_items: number }` |
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
- Use `trim` to enforce byte budgets before interpolation when `max_size` is set
- Use `allow_regex` for allowlist checks and `deny_regex` for blocklist checks on risky inputs
- Prefer structured regexes like `{ pattern, flags }`; `/pattern/i` strings are also accepted and normalized internally
- Use `non_empty: true` for required user text and `reject_secrets: true` for common secret redaction checks
- When the caller should receive a structured fallback message instead of an exception, use object form with `return_message` on `allow_regex`, `deny_regex`, `non_empty`, or `reject_secrets`
- Escape literal braces with `\{{` and `\}}`
- In strict mode, missing variables throw an error
- In permissive mode, unresolved placeholders are left intact

Example with a size budget:

```yaml
context:
  inputs:
    - user_message
    - name: account_summary
      max_size: 4096
```

If a rendered value exceeds `max_size`, `renderPrompt()` emits a non-blocking `POK030` warning.
At render time, callers can also pass `onContextOverflow` to transform oversized values before warnings/rendering.

If a validator declares `return_message`, `renderPrompt()` returns that message in a structured result and omits the provider request instead of throwing for that validation failure. Invalid regex definitions still fail during `validate` and `compile` as `POK013` prompt-authoring errors.

Malformed `allow_regex` and `deny_regex` values fail during `validate` and `compile`, not just at render time. When regex compilation fails, the error includes the prompt id, variable name, field name, and raw configured value.

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
├── defaults.md          # global provider, model, metadata + system instructions
└── support/
    ├── defaults.md      # overrides for support/*
    └── reply.md         # inherits from support/defaults.md
```

Supported default fields:
- `provider` (front matter) — default provider for the folder
- `model` (front matter) — default model for the folder
- `cache` (front matter) — default provider-specific cache hints
- `metadata` (front matter) — merged with prompt-local metadata
- `# System instructions` (body section) — used when the prompt has none

This lets you configure app-wide settings like `provider` and `model`
in a single root `defaults.md`, so individual prompts only declare what's unique to them.

Important: `defaults.md` does not declare or infer `context.inputs` for a prompt.
If a prompt body uses placeholders, the prompt file itself must declare them.

Rules:
- Nearest subfolder `defaults.md` overrides parent defaults
- Prompt-local values always take precedence over defaults
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

Treat `response.schema` as the provider-neutral JSON Schema contract. The adapters emit it through provider-specific request fields: OpenAI/OpenRouter `response_format`, OpenAI Responses `text.format`, Anthropic `output_config.format`, and Gemini `generationConfig.responseJsonSchema`.

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
```

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
```

Raw blocks are provider-scoped (`openai`, `openai-responses`/`openai_responses`, `anthropic`, `gemini`/`google`, `openrouter`) and are shallow-merged into the final request body after normalized fields. When adding `raw`, include a short note in `# Notes` explaining why a first-class field is not being used.

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
3. **Declare every placeholder** in `context.inputs`; do not rely on defaults or includes to infer variables
4. **Use `defaults.md` for shared provider, model, metadata, and fallback system instructions**
5. **Use includes for reusable system behavior**, not for user-specific prompt bodies
6. **Prefer `createPromptOpsKit().renderPrompt()` for server-side app code** when prompts live as source files
7. **Prefer direct adapters for compiled assets or provider-specific integration points**
8. **Do not suggest browser-side provider calls for production** because credentials belong on the server
9. **Validate before compile and compile before shipping** when prompts are part of the build
10. **Variable names** should be `snake_case`
11. **Prompt file names** should be `kebab-case.md`
