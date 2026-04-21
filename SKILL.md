---
name: promptopskit
description: Guidance for creating and editing promptopskit prompt files, defaults, variables, and validation-safe templates.
---

# promptopskit — Prompt Engineering Skill

This project uses **promptopskit** to manage LLM prompts as code.
Prompts live in markdown files with YAML front matter, are validated against
a schema, and render into provider-specific request bodies (OpenAI, Anthropic,
Gemini, OpenRouter). Follow these instructions when creating or editing prompts.

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
| `provider` | enum | no | `openai`, `anthropic`, `google`, `gemini`, `openrouter`, or `any` |
| `model` | string | no | Model identifier (e.g. `gpt-5.4`, `claude-sonnet-4-20250514`) |
| `fallback_models` | string[] | no | Ordered fallback model list |
| `reasoning` | object | no | `{ effort: low|medium|high, budget_tokens: number }` |
| `sampling` | object | no | `{ temperature, top_p, frequency_penalty, presence_penalty, stop, max_output_tokens }` |
| `response` | object | no | `{ format: text|json|markdown, stream: boolean }` |
| `tools` | array | no | Tool names (strings) or inline definitions with `{ name, description, input_schema }` |
| `mcp` | object | no | `{ servers: [string | { name, config }] }` |
| `context.inputs` | `Array<string | { name, max_size? }>` | no | Declared variable names used in templates, with optional size budgets |
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
`response`, `tools`.

Override application order: **base → environment → tier → runtime**.

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

## Using the library (TypeScript / JavaScript)

### Quick start

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit({ sourceDir: './prompts' });

// Load → resolve includes → apply overrides → render
const result = await kit.renderPrompt({
  path: 'greeting',
  provider: 'openai',
  variables: { name: 'Alice' },
  environment: 'production',
});

// result.request.body is ready for the provider's API
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify(result.request.body),
});
```

You can control render-time context size warnings at the top level:

```typescript
const kit = createPromptOpsKit({
  sourceDir: './prompts',
  warnings: {
    contextSize: process.env.NODE_ENV === 'production' ? 'off' : 'console-and-result',
  },
});
```

### Browser / client-side demos

For browser code, client components, or frontend-only demos:

- Do not import `createPromptOpsKit`, `loadPromptFile`, or other top-level runtime helpers from `promptopskit` in client code. The top-level entry loads Node file-system/path modules for source and compiled prompt loading.
- Instead, use a precompiled prompt artifact or an inlined `ResolvedPromptAsset` object and render it with a provider subpath adapter such as `promptopskit/openai`.
- If the prompt lives in files, compile it ahead of time with `npx promptopskit compile ./prompts ./dist/prompts --format esm` and import the generated ESM artifact into the client.
- Provider adapters accept `environment` and `tier` in `validate()` and `render()`, so use those options directly when selecting overrides for compiled or inline assets.
- For small demos, it is acceptable to inline the resolved prompt asset directly in the client file.
- Keep transport and auth in the application layer. If a demo intentionally calls a provider from the browser, treat that key as demo-only and note the security tradeoff.

Example:

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

const request = openaiAdapter.render(prompt, {
  environment: 'prod',
  variables: {
    pull_request_body: 'Add theming and dark mode support to the application.',
  },
  strict: true,
});

// request.body is ready for the OpenAI SDK or fetch.
```

### Step-by-step API

```typescript
import {
  parsePrompt,
  resolveIncludes,
  applyOverrides,
  getAdapter,
} from 'promptopskit';
import { readFileSync } from 'fs';

// 1. Parse a prompt file
const source = readFileSync('./prompts/greeting.md', 'utf-8');
const asset = parsePrompt(source, 'greeting.md');

// 2. Resolve includes
const resolved = await resolveIncludes(asset, './prompts');

// 3. Apply overrides
const configured = applyOverrides(resolved, {
  environment: 'production',
  tier: 'premium',
});

// 4. Get provider adapter and render
const adapter = getAdapter(configured.provider ?? 'openai');
const request = adapter.render(configured, {
  variables: { name: 'Alice' },
  history: [
    { role: 'user', content: 'Previous message' },
    { role: 'assistant', content: 'Previous response' },
  ],
});
```

### Available provider adapters

| Provider | Import path | Provider request format |
|----------|------------|----------------------|
| OpenAI | `promptopskit` or `promptopskit/openai` | Chat Completions API |
| Anthropic | `promptopskit/anthropic` | Messages API |
| Gemini | `promptopskit/gemini` | GenerateContent API |
| OpenRouter | `promptopskit/openrouter` | OpenAI-compatible + extras |

### Validation

```typescript
import { validateAsset, parsePrompt } from 'promptopskit';

const asset = parsePrompt(source);
const result = validateAsset(asset);

if (!result.valid) {
  console.error(result.errors); // Validation error codes: POK001-POK021
}
```

### Testing helpers

```typescript
import { createMockAsset, parseTestPrompt } from 'promptopskit/testing';

// Create a mock asset for unit tests
const mock = createMockAsset({ model: 'gpt-4.1-mini' });

// Parse an inline prompt string for tests
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
| `promptopskit validate <dir>` | Validate all prompt files in a directory |
| `promptopskit compile <src> <out>` | Compile .md prompts to JSON artifacts |
| `promptopskit render <file> [--set key=value]` | Render a prompt preview |
| `promptopskit inspect <file>` | Print the normalized prompt asset |

---

## Conventions to follow

1. **One prompt per file** — each `.md` file is a single prompt asset
2. **Always set `id` and `schema_version: 1`** in front matter (or inherit `schema_version` from `defaults.md`)
3. **Declare all variables** in `context.inputs` that appear in templates; do not leave placeholders undeclared just because other settings come from `defaults.md`
4. **Use includes** for shared system instructions (tone, safety, formatting)
5. **Keep prompt templates focused** — compose behavior via includes, not duplication
6. **Use environment overrides** for dev/staging/prod model differences
7. **Add test sidecars** (`.test.yaml`) for critical prompts
8. **Run `promptopskit validate`** before committing changes
9. **Use `defaults.md`** to share provider, model, metadata, and system instructions across a folder
10. **Variable names** should be `snake_case`
11. **Prompt file names** should be `kebab-case.md`
