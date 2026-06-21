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
import {
  createHardcodedPromptResponder,
  createMockAsset,
  createMockResolvedAsset,
  getHardcodedPromptResponse,
  loadPromptTestSidecar,
  parseTestPrompt,
  renderPromptTestCase,
} from 'promptopskit/testing';
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

By convention, test data for a prompt lives in a `.test.yaml` file alongside the prompt. `promptopskit init` creates `hello.md`, `hello.test.yaml`, and `tests/hello.prompt.test.mjs` so the starter prompt has executable test coverage immediately.

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
    response:
      message: "Hello, World! How can I help you today?"
  - name: named-greeting
    variables:
      name: "Alice"
    response:
      message: "Hello, Alice! How can I help you today?"
```

Each case has:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Test case name |
| `variables` | `Record<string, string>` | Variable values for this case |
| `response` | `unknown` | Optional hardcoded response for deterministic development and CI tests |

### CLI integration

The `render` command auto-loads the sidecar file when no `--vars` flag is provided:

```bash
# Uses hello.test.yaml first case's variables automatically
promptopskit render hello.md
```

### Using in tests

```typescript
import { createPromptOpsKit } from 'promptopskit';
import { loadPromptTestSidecar, renderPromptTestCase } from 'promptopskit/testing';

const kit = createPromptOpsKit({ sourceDir: './prompts' });
const sidecar = await loadPromptTestSidecar('./prompts/hello.test.yaml');

for (const testCase of sidecar.cases) {
  const { rendered, response } = await renderPromptTestCase(kit, {
    sidecar,
    caseName: testCase.name,
    path: 'hello',
    provider: 'openai',
    environment: 'dev',
    strict: true,
  });

  // Assert on rendered.request.body and, when present, response.
}
```

### Hardcoded responses

PromptOpsKit renders provider request bodies, but your app owns the network call. For unit tests and local development, keep deterministic responses in the sidecar and route your app through a tiny fake model runner:

```typescript
import { createHardcodedPromptResponder, loadPromptTestSidecar } from 'promptopskit/testing';

const sidecar = await loadPromptTestSidecar('./prompts/hello.test.yaml');
const respond = createHardcodedPromptResponder(sidecar);

const result = respond('basic-greeting');
// { message: 'Hello, World! How can I help you today?' }
```

PromptOpsKit sidecars are repo-native fixtures for rendering, unit tests, CI, and deterministic app development without making provider calls.
