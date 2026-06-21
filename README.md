# PromptOpsKit

[![npm version](https://img.shields.io/npm/v/promptopskit.svg)](https://www.npmjs.com/package/promptopskit)
[![CI](https://github.com/PredictabilityAtScale/promptopskit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/PredictabilityAtScale/promptopskit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

**Turn hardcoded AI prompts into versioned, tested application assets.**

Your prompts are already in Git. PromptOpsKit makes them manageable.

Keep prompts, model settings, tools, input validation, shared instructions, environment overrides, and tests together in Markdown files that live in Git and ship with your app. Render provider-ready request bodies without giving up your SDK, gateway, auth, retries, routing, observability, or billing.

PromptOpsKit is not a prompt dashboard, LLM gateway, or hosted runtime service. It is the repo-native layer between scattered prompt strings and production AI calls.

## Why PromptOpsKit?

From scattered prompt glue:

- Prompt strings live inline in code
- Model config and tools drift in separate files
- Validation checks happen outside the prompt
- Environment logic hides in if/else branches
- Testing is ad hoc and hard to review

To one reviewable asset:

- Prompt, model, tools, and input rules live together
- `includes` and `defaults.md` avoid copy-paste drift
- `environments` and `tiers` handle overrides cleanly
- `.test.yaml` sidecars keep deterministic test behavior
- Runtime rendering and compiled artifacts support production deployment

Core capabilities:

- **Markdown prompt assets** — capture prompt text, model config, tool bindings, context rules, and metadata together.
- **Provider-ready output** — render request bodies for OpenAI Chat, OpenAI Responses, Anthropic, Gemini, OpenRouter, and LLMAsAService while your app owns transport.
- **Input hardening** — define required values, size limits, allow/deny patterns, and secret rejection close to the prompt template.
- **Reusable composition** — share tone, policy, and safety instructions with `includes`, and apply folder-level standards with `defaults.md`.
- **Environment and tier overrides** — keep dev/prod and plan-specific behavior in one prompt source with explicit, reviewable overrides.
- **Sidecar tests** — run deterministic prompt checks in local development and CI without calling a model.
- **Prompt compression** — optionally compress or compact rendered prompt templates before provider caching and request generation.

## Install

```bash
npm install promptopskit
```

## Quick Start

### 1. Scaffold starter prompts

```bash
npx promptopskit init
npx promptopskit skill
```

This creates:

```
prompts/
├── defaults.md         # Folder-level defaults (provider, model, options, metadata, system instructions)
├── hello.md            # Sample prompt with variables
├── hello.test.yaml     # Test sidecar with sample inputs and hardcoded responses
└── shared/
    └── tone.md         # Shared system instructions (included via composition)

tests/
└── hello.prompt.test.mjs # Executable starter test for the hello prompt
```

### 2. Write a prompt

```markdown
---
id: support/reply
schema_version: 1
provider: openai
model: gpt-5.4
includes:
  - ./shared/tone.md
context:
  inputs:
    - name: user_message
      non_empty: true
      reject_secrets: true
environments:
  dev:
    model: gpt-5.4-mini
---

# System instructions

You are a helpful support assistant.

# Prompt template

{{ user_message }}
```

### 3. Render for a provider

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit({ sourceDir: './prompts' });

const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  environment: 'prod',
  variables: {
    user_message: 'How do I reset my password?',
  },
});

if (result.returnMessage) {
  return result.returnMessage;
}

// result.request.body is ready for fetch()
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify(result.request.body),
});
```

You can control context size warning behavior at the kit level:

```typescript
const kit = createPromptOpsKit({
  warnings: {
    contextSize: process.env.NODE_ENV === 'production' ? 'off' : 'console-and-result',
  },
});
```

Supported values for `warnings.contextSize` are `auto`, `off`, `result-only`, `console`, and `console-and-result`.

## Features

- **Prompts as Markdown** — YAML front matter for settings, H1 headings for sections (`# System instructions`, `# Prompt template`, `# Notes`)
- **Variable interpolation** — `{{ variable }}` syntax with strict and permissive modes
- **Composition** — `includes` to share system instructions across prompts, with circular detection
- **Folder defaults** — `defaults.md` inheritance for shared provider, model, options, metadata, and system instructions
- **Overrides** — Environment and tier-based overrides (base → env → tier → runtime)
- **6 provider adapters** — OpenAI (Chat), OpenAI (Responses), Anthropic, Gemini, OpenRouter, LLMAsAService
- **Prompt compression** — optional `compression.thetokencompany` calls TheTokenCompany, while `compression.heuristic` and `compression.code` run local no-backend compression/compaction before provider cache fields are applied
- **Provider-aware input caching controls** — optional `cache` front matter maps to OpenAI prompt cache hints, Anthropic `cache_control`, and Gemini `cachedContent`
- **Vendor escape hatch** — optional `raw.<provider>` blocks shallow-merge unmodeled request-body fields into the final provider payload
- **Validation** — Zod schema validation, Levenshtein-based "did you mean?" for typos, variable usage checks
- **Context hardening** — copyable `/pattern/i` regex literals, structured regexes with `return_message`, and built-in `non_empty` / `reject_secrets` validators
- **Optional short-circuit messages** — validators can return a structured `returnMessage` instead of throwing when configured
- **Context size guardrails** — optional per-input `max_size` metadata with non-blocking render-time warnings
- **History preservation** — optional `context.history.max_items` compacts older conversation turns into one preserved history item, with a runtime `onHistoryCompaction` hook for custom summaries
- **Warning controls** — top-level config can suppress or emit context size warnings differently in dev and prod
- **Caching** — LRU cache with mtime-based invalidation
- **CLI** — init, validate, compile, render, inspect, skill
- **Compiled artifacts** — Pre-compile `.md` → JSON or ESM for production, with validation before artifacts are written

## Provider Adapters

Each adapter produces a `{ body, provider, model }` object shaped for the target API. You handle the HTTP call.

```typescript
// OpenAI
import { createPromptOpsKit } from 'promptopskit';
const kit = createPromptOpsKit();
let result = await kit.renderPrompt({
  path: 'hello',
  provider: 'openai',
  variables: { name: 'World', app_context: 'Welcome screen' },
});
if (!result.request) throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
const { request } = result;
// request.body → { model, messages, temperature, reasoning_effort, ... }

// Anthropic — system is a top-level field, max_tokens defaults to 4096
result = await kit.renderPrompt({
  path: 'hello',
  provider: 'anthropic',
  variables: { name: 'World', app_context: 'Welcome screen' },
});
if (!result.request) throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
// request.body → { model, messages, system, max_tokens, ... }

// Gemini — contents/systemInstruction/generationConfig structure
result = await kit.renderPrompt({
  path: 'hello',
  provider: 'gemini',
  variables: { name: 'World', app_context: 'Welcome screen' },
});
if (!result.request) throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
// request.body → { contents, systemInstruction, generationConfig, ... }

// OpenRouter — same shape as OpenAI, different provider label
result = await kit.renderPrompt({
  path: 'hello',
  provider: 'openrouter',
  variables: { name: 'World', app_context: 'Welcome screen' },
});
if (!result.request) throw new Error(result.returnMessage ?? 'Prompt rendering failed.');

// LLMAsAService — OpenAI-compatible gateway with project and customer metadata
result = await kit.renderPrompt({
  path: 'hello',
  provider: 'llmasaservice',
  runtime: {
    provider_options: {
      llmasaservice: {
        project_id: process.env.LLM_GATEWAY_PROJECT_ID,
        customer: { customer_id: 'cust_123', customer_name: 'Acme' },
      },
    },
  },
  variables: { name: 'World', app_context: 'Welcome screen' },
});
if (!result.request) throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
// result.request.body → { model, messages, customer, ... }
// result.request.headers → { 'x-project-id': '...' }
```

Provider adapters are also available as direct imports:

```typescript
import { openaiAdapter } from 'promptopskit/openai';
import { openaiResponsesAdapter } from 'promptopskit/openai-responses';
import { anthropicAdapter } from 'promptopskit/anthropic';
import { geminiAdapter } from 'promptopskit/gemini';
import { openrouterAdapter } from 'promptopskit/openrouter';
import { llmasaserviceAdapter } from 'promptopskit/llmasaservice';
```

Direct adapter rendering also accepts `environment` and `tier` selectors. This is useful for compiled JSON/ESM assets in browser, edge, or worker code:

```typescript
import type { ResolvedPromptAsset } from 'promptopskit';
import { openaiAdapter } from 'promptopskit/openai';
import compiledPrompt from './.generated-prompts/esm/summarizePullRequest.mjs';

const prompt = compiledPrompt as ResolvedPromptAsset;

const validation = openaiAdapter.validate(prompt, { environment: 'dev' });
if (!validation.valid) {
  throw new Error(validation.errors.join(' '));
}

const request = openaiAdapter.render(prompt, {
  environment: 'dev',
  variables: {
    pull_request_body: 'Implement theming and dark mode across the app.',
  },
  strict: true,
});
```

In browser or client-side code, keep provider credentials on the server. Use the rendered request body with your own server endpoint, server action, or edge function rather than calling a provider directly from the client.

### Prompt compression, provider-specific fields, and raw passthrough

Use normalized fields first (`sampling`, `response`, `compression`, `cache`, `tools`) so prompts stay portable. `response.schema` is the neutral JSON Schema path; adapters emit it as OpenAI/OpenRouter/LLMAsAService `response_format`, OpenAI Responses `text.format`, Anthropic `output_config.format`, and Gemini `generationConfig.responseJsonSchema`. You can also provide `response.schema_ref` to load schema from a prompt-relative `.json` file or `.js/.mjs/.cjs` zod module (mutually exclusive with `response.schema`).

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

At render time, pass the caller-owned API key. PromptOpsKit calls `POST https://api.thetokencompany.com/v1/compress` directly with `fetch`; no TheTokenCompany SDK is required.

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

Compression applies only to the rendered `# Prompt template`. System instructions and history are left unchanged, and provider cache fields are applied to the compressed prompt text.

For no-backend compression, use the local heuristic compressor:

```yaml
compression:
  heuristic:
    enabled: true
    query_variable: user_question
    json_to_toon: true
```

For code, use compaction instead of text compression:

```yaml
compression:
  code:
    enabled: true
```

Individual context insertions can opt in with schema (`context.inputs[].compression`) or at the placeholder call site:

```markdown
Context: {{ account_context | compress }}
Payload: {{ json_payload | toon }}
Source: {{ source_code | compact }}
```

If `json_to_toon: true` or `{{ value | toon }}` cannot parse a complete JSON object or array, PromptOpsKit preserves the original value and returns a `POK031` warning. When `compression.code.enabled: true`, PromptOpsKit skips TheTokenCompany prompt-template compression and returns `POK033` so code is not text-compressed by a backend.

Credit: the local heuristic approach is based on Jason Kneen's [open-thetokenco](https://github.com/jasonkneen/open-thetokenco/tree/main).
TOON preprocessing uses a local encode-only implementation inspired by the MIT-licensed [TOON project](https://github.com/toon-format/toon) by Johann Schopplich, without adding `@toon-format/toon` as a runtime dependency.

See [Compression and Compaction](./docs/compression.md) for complete examples and token-savings reporting.

Use `provider_options` when PromptOpsKit has a known provider-specific mapping, such as Anthropic `top_k`, Gemini's native `response_schema`, OpenRouter routing fields, or LLMAsAService gateway routing/customer metadata.

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
provider_options:
  openrouter:
    provider:
      order: ["anthropic", "openai"]
    transforms: ["middle-out"]
  llmasaservice:
    project_id: "llm-project-id"
    # Optional default; usually pass the real customer at render time.
    customer:
      customer_id: "cust_123"
      customer_name: "Acme"
```

For LLMAsAService, `provider_options.llmasaservice.customer` is intended to be render-time attribution for the current account/user. A prompt can keep a default, but production calls should normally override it through `runtime.provider_options.llmasaservice.customer`.

When a provider adds a body field PromptOpsKit does not model yet, use `raw`:

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
    conversationId: "conv_123"
```

Each adapter reads only its matching raw block and shallow-merges it into the generated request body after normalized mappings. This is intentionally an escape hatch; prefer first-class fields when they exist.

On the server, adapters also provide async prompt-aware helpers so you can use the default `./prompts` and `./.generated-prompts/json` directories without creating a `PromptOpsKit` instance:

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

If you need a different layout, keep passing `sourceDir` and `compiledDir` explicitly.

`renderPrompt()` and `validatePrompt()` use the same source-versus-compiled resolution rules as `kit.renderPrompt()`. The existing synchronous `render()` and `validate()` methods still work for already-resolved compiled or inline assets.

## Optional UsageTap Tracking

PromptOpsKit can also help you track provider calls with UsageTap.com while keeping the core render API transport-light.

```typescript
import { createPromptOpsKit } from 'promptopskit';
import { createUsageTapClient, runOpenAIWithUsageTap } from 'promptopskit/usagetap';

const kit = createPromptOpsKit({ sourceDir: './prompts' });
const usageTap = createUsageTapClient({ apiKey: process.env.USAGETAP_API_KEY! });

const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables: {
    user_message: 'How do I reset my password?',
    app_context: 'Account settings page',
  },
});

if (!result.request) {
  throw new Error(result.returnMessage ?? 'Prompt rendering failed.');
}

const { request } = result;

const tracked = await runOpenAIWithUsageTap(usageTap, {
  begin: {
    customerId: 'user_123',
    feature: 'chat.send',
    requested: { standard: true, premium: true, search: true },
    idempotencyKey: 'chat-send-user-123-req-456',
  },
  request,
  entitlementMode: 'apply',
  modelTiers: {
    standard: 'gpt-5.4-mini',
    premium: 'gpt-5.4',
  },
  toolEntitlements: {
    image_tool: 'image',
    web_lookup: 'search',
  },
  invoke: async (requestUsed) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestUsed.body),
    });

    return response.json();
  },
});

// tracked.response      -> vendor JSON response
// tracked.begin         -> UsageTap call_begin payload
// tracked.end           -> UsageTap call_end payload
// tracked.requestUsed   -> effective request after optional entitlement changes
// tracked.effectiveUsage -> usage sent to UsageTap
```

Notes:
- `entitlementMode` defaults to `'off'`. Set it to `'apply'` only when you want UsageTap allowances to mutate a cloned provider request.
- `runOpenRouterWithUsageTap`, `runLLMAsAServiceWithUsageTap`, `runAnthropicWithUsageTap`, and `runGeminiWithUsageTap` follow the same pattern.
- `extractOpenAIUsage`, `extractAnthropicUsage`, and `extractGeminiUsage` are public if you want to manage UsageTap lifecycle yourself.

For explicit lifecycle control, use `beginUsageTapCall`, `endUsageTapCall`, or `withUsageTapCall` from `promptopskit/usagetap`. Full documentation: [docs/usagetap.md](./docs/usagetap.md).

## Overrides

Define environment and tier overrides in front matter. Precedence: **base → environment → tier → runtime**. Scalars and arrays are replaced, not merged.

```markdown
---
id: support/reply
schema_version: 1
provider: openai
model: gpt-5.4
reasoning:
  effort: high
sampling:
  temperature: 0.7
environments:
  dev:
    model: gpt-5.4-mini
    reasoning:
      effort: low
    sampling:
      temperature: 0.2
  prod:
    model: gpt-5.4
tiers:
  free:
    model: gpt-5.4-mini
  pro:
    model: gpt-5.4
---
```

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  environment: 'dev',
  tier: 'pro',
  variables: { user_message: '...' },
});
```

## Composition

Share system instructions across prompts using `includes`. Included system instructions are prepended before local ones.

```markdown
---
id: support/reply
schema_version: 1
includes:
  - ./shared/tone.md
---

# System instructions

Handle support requests carefully.
```

## Folder defaults

Define a `defaults.md` file in `prompts/` (and optional subfolders) to provide inherited defaults for prompts:

- Shared `provider`, `model`, `fallback_models`, `reasoning`, `sampling`, `response`, `compression`, `cache`, `provider_options`, `raw`, `tools`, `mcp`, `context`, `includes`, `environments`, and `tiers` in front matter
- Shared `metadata` defaults in front matter
- Shared `# System instructions` in body
- Nearest subfolder `defaults.md` overrides parent defaults
- Prompt-local values always win over defaults
- Included files (`includes`) are not affected by folder defaults

Scalars and arrays are replaced by nearer values. Object blocks are shallow-merged, including provider sub-blocks such as `provider_options.llmasaservice`, `compression.thetokencompany`, and `cache.openai`.

> `promptopskit init` scaffolds a starter `defaults.md` in the prompts root.

```text
prompts/
├── defaults.md
└── support/
    ├── defaults.md
    └── reply.md
```

## CLI

```bash
# Scaffold starter prompts and deploy AI agent instructions
promptopskit init [dir]
promptopskit skill

# Validate all .md files in a directory
promptopskit validate [sourceDir] [--source <dir>] [--strict]

# Compile .md → JSON/ESM artifacts
promptopskit compile [sourceDir] [outputDir] [--source <dir>] [--output <dir>] [--dry-run] [--format json|esm] [--no-clean]

# Render a prompt preview (auto-loads .test.yaml sidecar)
promptopskit render <file> [--env <name>] [--tier <name>] [--vars <file>] [--json]

# Print normalized asset as JSON
promptopskit inspect <file>

# Deploy AI agent instructions for all major coding assistants
promptopskit skill [--target agents|claude|copilot|cursor] [--force]
```

## AI Agent Instructions

The `skill` command deploys instruction files so AI coding assistants automatically understand how to create and manage prompts with promptopskit. Each file references the full guide at `node_modules/promptopskit/SKILL.md`, so instructions stay in sync with the installed version. By default it generates files for **all** major vendors:

```bash
# Deploy for all AI coding assistants (default)
promptopskit skill
# → AGENTS.md                                          (Codex, OpenCode, Cursor, Copilot)
# → CLAUDE.md                                          (Claude Code — imports AGENTS.md)
# → .github/instructions/promptopskit.instructions.md  (GitHub Copilot)
# → .cursor/rules/promptopskit.mdc                     (Cursor)

# Deploy only a specific target
promptopskit skill --target copilot

# Overwrite entire file instead of merging
promptopskit skill --force
```

If a target file already exists, the promptopskit section is merged in-place (or appended) rather than skipping or overwriting. Use `--force` to replace the entire file.

The `CLAUDE.md` file uses Claude Code's `@AGENTS.md` import syntax to avoid duplicating content.

## Inline Source

Render prompts from strings without files:

```typescript
const result = await kit.renderPrompt({
  source: `---
id: inline
schema_version: 1
provider: openai
model: gpt-5.4
---

# Prompt template

Hello {{ name }}!`,
  provider: 'openai',
  variables: { name: 'World' },
});
```

## Testing Helpers

```typescript
import {
  createHardcodedPromptResponder,
  createMockAsset,
  createMockResolvedAsset,
  loadPromptTestSidecar,
  parseTestPrompt,
} from 'promptopskit/testing';

const asset = createMockAsset({ model: 'gpt-5.4' });
const resolved = createMockResolvedAsset();
const parsed = parseTestPrompt('---\nid: test\nschema_version: 1\n---\n\nHello');

const sidecar = await loadPromptTestSidecar('./prompts/hello.test.yaml');
const respond = createHardcodedPromptResponder(sidecar);
const response = respond('basic-greeting');
```

## API Reference

### `createPromptOpsKit(config)`

Creates a `PromptOpsKit` instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sourceDir` | `string` | — | Path to prompt `.md` files (required) |
| `compiledDir` | `string` | — | Path to compiled artifacts |
| `mode` | `'auto' \| 'compiled-only' \| 'source-only'` | `'auto'` | Resolution strategy |
| `cache` | `boolean` | `true` | Enable LRU cache with mtime invalidation |
| `warnings.contextSize` | `'auto' \| 'off' \| 'result-only' \| 'console' \| 'console-and-result'` | `'auto'` | Control whether render-time context size warnings are returned, logged, both, or suppressed |

### `kit.renderPrompt(options)`

Renders a prompt for a specific provider. Returns `{ resolved, request?, returnMessage?, compression?, compressionSummary?, warnings }`.

| Option | Type | Description |
|--------|------|-------------|
| `path` | `string` | Prompt path (no extension), e.g. `'support/reply'` |
| `source` | `string` | Inline prompt source (alternative to path) |
| `provider` | `string` | `'openai'`, `'openai-responses'`, `'anthropic'`, `'gemini'`, `'openrouter'`, `'llmasaservice'` |
| `variables` | `Record<string, string>` | Template variables |
| `onContextOverflow` | `(info) => string` | Optional callback to transform oversized context values before rendering |
| `onHistoryCompaction` | `(info) => string \| { role, content }` | Optional callback to compact overflow history when `context.history.max_items` is exceeded |
| `environment` | `string` | Environment override name |
| `tier` | `string` | Tier override name |
| `history` | `Array<{ role, content }>` | Conversation history. If the prompt declares `context.history.max_items`, older turns are compacted into one preserved history item before provider rendering. |
| `toolRegistry` | `Record<string, unknown>` | Tool definitions for resolving string tool references |
| `strict` | `boolean` | Fail on missing variables except object-form inputs marked `optional: true` |
| `openaiResponses` | `object` | Optional Responses API extras (`previous_response_id`, `conversation`, `instructions`, `parallel_tool_calls`, `max_tool_calls`, `store`, `metadata`, `include`, `background`) |
| `theTokenCompany` | `object` | Optional compression settings (`apiKey`, `baseURL`, `fetch`) used when `compression.thetokencompany.enabled: true` |

Use `compressionSummary.tokensSaved` for a lightweight operation-level aggregate across compression and compaction steps. Use `compression` for the detailed per-step breakdown.

### `kit.loadPrompt(path)` / `kit.resolvePrompt(path, options)` / `kit.validatePrompt(path)`

Lower-level methods for loading, resolving (includes + overrides), and validating individual prompts.

### Standalone Functions

```typescript
import { parsePrompt, interpolate, extractVariables, resolveIncludes, applyOverrides, validateAsset, getAdapter } from 'promptopskit';
```

## Schema

Prompt files use YAML front matter with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique prompt identifier (required) |
| `schema_version` | `number` | Schema version, currently `1` |
| `provider` | `string` | `openai`, `openai-responses`, `anthropic`, `gemini` (or `google`), `openrouter`, `llmasaservice`, `any` |
| `model` | `string` | Model name |
| `fallback_models` | `string[]` | Fallback model list |
| `reasoning` | `object` | `{ effort, budget_tokens }` |
| `sampling` | `object` | `{ temperature, top_p, frequency_penalty, presence_penalty, stop, max_output_tokens }` |
| `response` | `object` | `{ format, stream, schema, schema_ref, schema_name, schema_description, schema_strict }` |
| `compression` | `object` | Prompt-template compression controls (`thetokencompany`, `heuristic`, `code`) |
| `cache` | `object` | Provider-specific cache controls (`openai`, `anthropic`, `gemini`/`google`) |
| `tools` | `array` | Tool references (string names or inline definitions) |
| `provider_options` | `object` | Provider-specific non-portable options (`anthropic`, `gemini`, `openrouter`, `llmasaservice`) |
| `raw` | `object` | Provider-scoped request-body passthrough (`openai`, `openai-responses`, `anthropic`, `gemini`/`google`, `openrouter`, `llmasaservice`) |
| `mcp` | `object` | MCP server references |
| `context` | `object` | `{ inputs, history }` — declare expected variables, with optional per-input `optional`, `warnings`, `max_size`, `trim`, structured or literal `allow_regex`/`deny_regex`, built-in `non_empty` / `reject_secrets` validators, and `history.max_items` compaction |
| `includes` | `string[]` | Paths to included prompt files |
| `environments` | `object` | Named environment overrides |
| `tiers` | `object` | Named tier overrides |
| `metadata` | `object` | `{ owner, tags, review_required, stable }` |

For `allow_regex` and `deny_regex`, prefer unquoted `/pattern/i` literal form so regex escapes such as `\s` and `\b` stay copyable from tools like regex101. If you use structured `pattern:` form, use single-quoted YAML strings or double each backslash in double-quoted strings.

## Website

The `website/` directory contains a standalone marketing website for PromptOpsKit.

## License

[MIT](LICENSE)
