# Testing

PromptOpsKit provides test helpers and a sidecar test file convention.

## Running the test suite

```bash
# Standard run
npm test

# Serial run (Vitest equivalent of Jest's --runInBand)
npm run test:serial
```

> Note: `--runInBand` is a Jest flag and is not recognized by Vitest.

## Test helpers

Import from `promptopskit/testing`:

```typescript
import { createMockAsset, createMockResolvedAsset, parseTestPrompt } from 'promptopskit/testing';
```

### `createMockAsset(overrides?)`

Create a mock `PromptAsset` with sensible defaults for unit tests.

```typescript
const asset = createMockAsset();
// {
//   id: 'test.prompt',
//   schema_version: 1,
//   provider: 'openai',
//   model: 'gpt-5.4',
//   sections: {
//     system_instructions: 'You are a test assistant.',
//     prompt_template: 'Hello {{ name }}',
//   },
// }

const custom = createMockAsset({
  model: 'gpt-5.4-mini',
  sampling: { temperature: 0 },
});
```

### `createMockResolvedAsset(overrides?)`

Create a mock `ResolvedPromptAsset` — includes the `source` field that resolved assets have.

```typescript
const resolved = createMockResolvedAsset();
// Same as createMockAsset() plus:
//   source: { file_path: 'test.md' }

const custom = createMockResolvedAsset({
  sections: {
    system_instructions: 'Custom system prompt.',
    prompt_template: '{{ query }}',
  },
});
```

### `parseTestPrompt(source)`

Parse an inline prompt string for testing. Returns a `PromptAsset`.

```typescript
const asset = parseTestPrompt(`---
id: test
schema_version: 1
provider: openai
model: gpt-5.4
---

# Prompt template

Hello {{ name }}!
`);
```

## Test sidecar files

By convention, test data for a prompt lives in a `.test.yaml` file alongside the prompt:

```
prompts/
├── hello.md
├── hello.test.yaml
└── support/
    ├── reply.md
    └── reply.test.yaml
```

### Format

```yaml
cases:
  - name: basic-greeting
    variables:
      name: "World"
  - name: named-greeting
    variables:
      name: "Alice"
```

Each case has:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Test case name |
| `variables` | `Record<string, string>` | Variable values for this case |

### CLI integration

The `render` command auto-loads the sidecar file when no `--vars` flag is provided:

```bash
# Uses hello.test.yaml first case's variables automatically
promptopskit render hello.md
```

### Using in tests

```typescript
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit({ sourceDir: './prompts' });
const sidecar = parse(readFileSync('./prompts/hello.test.yaml', 'utf-8'));

for (const testCase of sidecar.cases) {
  const result = await kit.renderPrompt({
    path: 'hello',
    provider: 'openai',
    variables: testCase.variables,
  });
  // Assert on result.request.body
}
```
