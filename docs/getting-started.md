# Getting Started

## Install

```bash
npm install promptopskit
```

Requires Node.js 20 or later.

## Scaffold starter prompts

```bash
npx promptopskit init
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

Existing files are never overwritten — the command skips them and reports what was skipped.

## Write a prompt

Create a Markdown file with YAML front matter and H1 sections:

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
  history:
    max_items: 10
  inputs:
    - name: user_message
      non_empty: true
      reject_secrets: true
    - name: app_context
      allow_regex: /^[A-Za-z0-9 _-]+$/i
includes:
  - ./shared/tone.md
---

# System instructions

You are a helpful support assistant helping inside {{ app_context }}.

# Prompt template

{{ user_message }}
```

See the [Prompt Format](./prompt-format.md) guide for the full structure.

## Render for a provider

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit({ sourceDir: './prompts' });

const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables: {
    user_message: 'How do I reset my password?',
    app_context: 'Billing settings page',
  },
  history: [
    { role: 'user', content: 'I am looking at my account page.' },
    { role: 'assistant', content: 'I can help with account access.' },
  ],
  onHistoryCompaction: ({ overflow }) =>
    `Earlier conversation summary: ${summarizeConversationUsingLLM(overflow)}`,
});

if (!result.request) {
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

To make context size warnings loud in development and silent in production, configure the kit once:

```typescript
const kit = createPromptOpsKit({
  sourceDir: './prompts',
  warnings: {
    contextSize: process.env.NODE_ENV === 'production' ? 'off' : 'console-and-result',
  },
});
```

`renderPrompt` returns `{ resolved, request, warnings }`:

| Field | Type | Description |
|-------|------|-------------|
| `resolved` | `ResolvedPromptAsset` | The fully resolved asset (includes inlined, overrides applied) |
| `request` | `ProviderRequest` | `{ body, provider, model }` plus optional transport metadata shaped for the target API |
| `warnings` | `string[]` | Non-fatal warnings (e.g. unsupported parameters for the chosen provider) |

Your application owns the HTTP call — PromptOpsKit produces the provider request shape and any provider-specific transport hints.

When `context.history.max_items` is set and runtime history exceeds that count, PromptOpsKit compacts older turns into one preserved history item and keeps the most recent turns. Use `onHistoryCompaction` when your app wants to provide its own summary.

## Validate prompts

```bash
npx promptopskit validate ./prompts
```

This checks all `.md` files for schema errors, unknown front matter keys (with "did you mean?" suggestions), variable usage mismatches, and malformed context regex definitions. For regex validators, prefer unquoted `/pattern/i` literals so backslash escapes stay copyable; double-quoted YAML regex strings with raw backslashes are reported as `POK013`.

## Compile for production

```bash
npx promptopskit compile
```

Pre-compiles `.md` files to JSON (or ESM) artifacts so deployments skip parsing entirely. Compilation validates prompt files first, so malformed regex definitions fail before artifacts are written. Add to your build scripts:

```json
{
  "scripts": {
    "build:prompts": "promptopskit compile"
  }
}
```

## Next steps

- [Prompt Format](./prompt-format.md) — Full Markdown structure and variable syntax
- [Providers](./providers.md) — How each provider adapter shapes the request body
- [Overrides](./overrides.md) — Target dev vs. prod or free vs. pro without duplication
- [Composition](./composition.md) — Share instructions across prompts with `includes`
- [CLI](./cli.md) — All CLI commands and options
