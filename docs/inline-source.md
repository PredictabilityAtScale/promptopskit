# Inline Source

Render prompts from strings without files on disk. Useful for quick prototyping, tests, or dynamically generated prompts.

## Usage

Pass `source` instead of `path` to `renderPrompt`:

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit({ sourceDir: '.' });

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

## With overrides

Inline prompts support environment and tier overrides:

```typescript
const result = await kit.renderPrompt({
  source: `---
id: inline
schema_version: 1
provider: openai
model: gpt-5.4
environments:
  dev:
    model: gpt-5.4-mini
---

# Prompt template

Hello {{ name }}!`,
  provider: 'openai',
  environment: 'dev',
  variables: { name: 'World' },
});

// result.request.body.model === 'gpt-5.4-mini'
```

## Standalone function

The standalone `renderPrompt` function works without creating a `PromptOpsKit` instance:

```typescript
import { renderPrompt } from 'promptopskit';

const result = await renderPrompt({
  source: `---
id: quick
schema_version: 1
---

# Prompt template

{{ question }}`,
  provider: 'openai',
  variables: { question: 'What is 2+2?' },
});
```

## Limitations

- **No includes**: `includes` paths cannot be resolved for inline prompts since there is no file path to resolve relative to.
- **No caching**: Inline sources are parsed fresh each time.
- **No validation**: Use `parsePrompt` + `validateAsset` separately if you need validation on inline content.
