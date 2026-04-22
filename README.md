# PromptOpsKit

[![npm version](https://img.shields.io/npm/v/promptopskit.svg)](https://www.npmjs.com/package/promptopskit)
[![CI](https://github.com/PredictabilityAtScale/promptopskit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/PredictabilityAtScale/promptopskit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

**Centralize prompts, system instructions, tools, and model settings — without leaving your codebase.**

Your prompts are already in Git. PromptOpsKit makes them manageable. It replaces hardcoded strings and scattered provider-specific glue with structured Markdown files where prompt text, model settings, sampling parameters, tool bindings, environment overrides, and composable shared instructions all live together — diffable, reviewable, and release-aware.

Provider adapters for OpenAI, Anthropic, Gemini, and OpenRouter produce a ready-to-send **request body only** — no HTTP client, no auth, no headers. Your application owns transport, so PromptOpsKit slots into any stack without opinions about how you call the API.

### Why PromptOpsKit?

- **Centralized, not scattered** — each prompt is a single Markdown file that captures prompt text, model config, tool bindings, and context rules together.
- **Operational, not just templated** — model name, temperature, reasoning effort, tools, and response format are declared alongside the prompt they govern.
- **Reusable, not duplicated** — `includes` lets you define shared tone, policy, or safety instructions once and compose them into any prompt.
- **Layered defaults, not repetition** — `defaults.md` in any folder sets shared `provider`, `model`, `metadata`, and `# System instructions` for that subtree, with nearest-folder override behavior.
- **Release-aware, not ad hoc** — environment and tier overrides swap models and parameters without forking prompt files.
- **Provider-portable** — write once, render for OpenAI, Anthropic, Gemini, or OpenRouter with correct body shapes.
- **Validate early** — Zod schema validation, Levenshtein-based "did you mean?" suggestions for typos, and variable usage checks catch mistakes before runtime.
- **Compile for production** — pre-compile `.md` to JSON or ESM so deployments skip parsing entirely.
- **Repo-native, not dashboard-native** — no hosted service, no external admin tool. Everything lives in source control.

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
├── defaults.md         # Folder-level defaults (provider, model, metadata, system instructions)
├── hello.md            # Sample prompt with variables
├── hello.test.yaml     # Test sidecar with sample inputs
└── shared/
    └── tone.md         # Shared system instructions (included via composition)
```

### 2. Write a prompt

```markdown
---
id: support/reply
schema_version: 1
provider: openai
model: gpt-5.4
reasoning:
  effort: medium
sampling:
  temperature: 0.7
context:
  inputs:
    - user_message
    - name: app_context
      max_size: 2000
includes:
  - ./shared/tone.md
---

# System instructions

You are a helpful support assistant working in {{ app_context }}.

# Prompt template

{{ user_message }}
```

### 3. Render for a provider

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit();

const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables: {
    user_message: 'How do I reset my password?',
    app_context: 'Account settings page',
  },
});

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
- **Folder defaults** — `defaults.md` inheritance for shared provider, model, metadata, and system instructions
- **Overrides** — Environment and tier-based overrides (base → env → tier → runtime)
- **4 provider adapters** — OpenAI, Anthropic, Gemini, OpenRouter — body-only output
- **Validation** — Zod schema validation, Levenshtein-based "did you mean?" for typos, variable usage checks
- **Context size guardrails** — optional per-input `max_size` metadata with non-blocking render-time warnings
- **Warning controls** — top-level config can suppress or emit context size warnings differently in dev and prod
- **Caching** — LRU cache with mtime-based invalidation
- **CLI** — init, validate, compile, render, inspect, skill
- **Compiled artifacts** — Pre-compile `.md` → JSON or ESM for production

## Provider Adapters

Each adapter produces a `{ body, provider, model }` object shaped for the target API. You handle the HTTP call.

```typescript
// OpenAI
import { createPromptOpsKit } from 'promptopskit';
const kit = createPromptOpsKit();
const { request } = await kit.renderPrompt({
  path: 'hello',
  provider: 'openai',
  variables: { name: 'World', app_context: 'Welcome screen' },
});
// request.body → { model, messages, temperature, reasoning_effort, ... }

// Anthropic — system is a top-level field, max_tokens defaults to 4096
const { request } = await kit.renderPrompt({
  path: 'hello',
  provider: 'anthropic',
  variables: { name: 'World', app_context: 'Welcome screen' },
});
// request.body → { model, messages, system, max_tokens, ... }

// Gemini — contents/systemInstruction/generationConfig structure
const { request } = await kit.renderPrompt({
  path: 'hello',
  provider: 'gemini',
  variables: { name: 'World', app_context: 'Welcome screen' },
});
// request.body → { contents, systemInstruction, generationConfig, ... }

// OpenRouter — same shape as OpenAI, different provider label
const { request } = await kit.renderPrompt({
  path: 'hello',
  provider: 'openrouter',
  variables: { name: 'World', app_context: 'Welcome screen' },
});
```

Provider adapters are also available as direct imports:

```typescript
import { openaiAdapter } from 'promptopskit/openai';
import { anthropicAdapter } from 'promptopskit/anthropic';
import { geminiAdapter } from 'promptopskit/gemini';
import { openrouterAdapter } from 'promptopskit/openrouter';
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

On the server, adapters also provide async prompt-aware helpers so you can use the default `./prompts` and `./.generated-prompts/json` directories without creating a `PromptOpsKit` instance:

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

If you need a different layout, keep passing `sourceDir` and `compiledDir` explicitly.

`renderPrompt()` and `validatePrompt()` use the same source-versus-compiled resolution rules as `kit.renderPrompt()`. The existing synchronous `render()` and `validate()` methods still work for already-resolved compiled or inline assets.

## Optional UsageTap Tracking

PromptOpsKit can also help you track provider calls with UsageTap.com while keeping the core render API body-only.

```typescript
import { createPromptOpsKit } from 'promptopskit';
import { createUsageTapClient, runOpenAIWithUsageTap } from 'promptopskit/usagetap';

const kit = createPromptOpsKit({ sourceDir: './prompts' });
const usageTap = createUsageTapClient({ apiKey: process.env.USAGETAP_API_KEY! });

const { request } = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables: {
    user_message: 'How do I reset my password?',
    app_context: 'Account settings page',
  },
});

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
- `runOpenRouterWithUsageTap`, `runAnthropicWithUsageTap`, and `runGeminiWithUsageTap` follow the same pattern.
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

- Shared `provider` and `model` in front matter
- Shared `metadata` defaults in front matter
- Shared `# System instructions` in body
- Nearest subfolder `defaults.md` overrides parent defaults
- Prompt-local values always win over defaults
- Included files (`includes`) are not affected by folder defaults

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
promptopskit validate <dir> [--strict]

# Compile .md → JSON/ESM artifacts
promptopskit compile [src] [out] [--dry-run] [--format json|esm] [--no-clean]

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
import { createMockAsset, createMockResolvedAsset, parseTestPrompt } from 'promptopskit/testing';

const asset = createMockAsset({ model: 'gpt-5.4' });
const resolved = createMockResolvedAsset();
const parsed = parseTestPrompt('---\nid: test\nschema_version: 1\n---\n\nHello');
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

Renders a prompt for a specific provider. Returns `{ resolved, request, warnings }`.

| Option | Type | Description |
|--------|------|-------------|
| `path` | `string` | Prompt path (no extension), e.g. `'support/reply'` |
| `source` | `string` | Inline prompt source (alternative to path) |
| `provider` | `string` | `'openai'`, `'anthropic'`, `'gemini'`, `'openrouter'` |
| `variables` | `Record<string, string>` | Template variables |
| `onContextOverflow` | `(info) => string` | Optional callback to transform oversized context values before rendering |
| `environment` | `string` | Environment override name |
| `tier` | `string` | Tier override name |
| `history` | `Array<{ role, content }>` | Conversation history |
| `toolRegistry` | `Record<string, unknown>` | Tool definitions for resolving string tool references |
| `strict` | `boolean` | Fail on missing variables |

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
| `provider` | `string` | `openai`, `anthropic`, `gemini` (or `google`), `openrouter`, `any` |
| `model` | `string` | Model name |
| `fallback_models` | `string[]` | Fallback model list |
| `reasoning` | `object` | `{ effort, budget_tokens }` |
| `sampling` | `object` | `{ temperature, top_p, frequency_penalty, presence_penalty, stop, max_output_tokens }` |
| `response` | `object` | `{ format, stream }` |
| `tools` | `array` | Tool references (string names or inline definitions) |
| `mcp` | `object` | MCP server references |
| `context` | `object` | `{ inputs, history }` — declare expected variables, with optional per-input `max_size`, `trim`, and `allow_regex`/`deny_regex` controls |
| `includes` | `string[]` | Paths to included prompt files |
| `environments` | `object` | Named environment overrides |
| `tiers` | `object` | Named tier overrides |
| `metadata` | `object` | `{ owner, tags, review_required, stable }` |

## Website

The `website/` directory contains a standalone marketing website for PromptOpsKit.

## License

[MIT](LICENSE)
