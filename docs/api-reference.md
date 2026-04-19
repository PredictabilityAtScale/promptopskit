# API Reference

## `createPromptOpsKit(config)`

Creates a `PromptOpsKit` instance.

```typescript
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit({
  sourceDir: './prompts',
  compiledDir: './dist/prompts',
  mode: 'auto',
  cache: true,
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sourceDir` | `string` | — | Path to prompt `.md` files (required) |
| `compiledDir` | `string` | — | Path to compiled artifacts |
| `mode` | `'auto' \| 'compiled-only' \| 'source-only'` | `'auto'` | Resolution strategy |
| `cache` | `boolean` | `true` | Enable LRU cache with mtime invalidation |

### Resolution modes

| Mode | Behavior |
|------|----------|
| `auto` | Prefer compiled artifacts when available, fall back to source. Warns if compiled artifact is older than source. |
| `compiled-only` | Only load from `compiledDir`. Throws if artifact is missing. |
| `source-only` | Only parse from `sourceDir`. Ignores compiled artifacts. |

## `kit.renderPrompt(options)`

Renders a prompt for a specific provider. Returns `{ resolved, request, warnings }`.

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables: { user_message: 'How do I reset my password?' },
  environment: 'prod',
  tier: 'pro',
  history: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi!' },
  ],
  strict: false,
});
```

| Option | Type | Description |
|--------|------|-------------|
| `path` | `string` | Prompt path (no extension), e.g. `'support/reply'` |
| `source` | `string` | Inline prompt source (alternative to `path`) |
| `provider` | `string` | `'openai'`, `'anthropic'`, `'gemini'`, `'openrouter'` (required) |
| `variables` | `Record<string, string>` | Template variables |
| `environment` | `string` | Environment override name |
| `tier` | `string` | Tier override name |
| `history` | `Array<{ role, content }>` | Conversation history |
| `toolRegistry` | `Record<string, unknown>` | Tool definitions for resolving string tool references |
| `strict` | `boolean` | Fail on missing variables (default `false`) |

Either `path` or `source` must be provided.

### Return value

```typescript
interface RenderResult {
  resolved: ResolvedPromptAsset;  // Fully resolved asset
  request: ProviderRequest;       // { body, provider, model }
  warnings: string[];             // Non-fatal provider warnings
}
```

## `kit.loadPrompt(path)`

Load a prompt asset from compiled or source (based on mode). Returns a `PromptAsset`.

```typescript
const asset = await kit.loadPrompt('support/reply');
```

## `kit.resolvePrompt(path, options)`

Load, resolve includes, and apply overrides. Returns a `ResolvedPromptAsset`.

```typescript
const resolved = await kit.resolvePrompt('support/reply', {
  environment: 'dev',
  tier: 'pro',
});
```

## `kit.validatePrompt(path)`

Validate a prompt file. Returns a `PromptValidationResult`.

```typescript
const result = await kit.validatePrompt('support/reply');
// { valid: boolean, errors: ValidationError[], warnings: ValidationError[] }
```

## `kit.clearCache()`

Clear the internal LRU cache.

```typescript
kit.clearCache();
```

## Standalone functions

All core functions are available as standalone imports for use without a `PromptOpsKit` instance:

```typescript
import {
  parsePrompt,
  loadPromptFile,
  extractSections,
  interpolate,
  extractVariables,
  resolveIncludes,
  applyOverrides,
  validateAsset,
  validateAssetWithIncludes,
  getAdapter,
} from 'promptopskit';
```

### `parsePrompt(content, filePath?)`

Parse a prompt Markdown string into a validated `PromptAsset`.

```typescript
const { asset, raw } = parsePrompt(markdownString, '/path/to/file.md');
// asset: PromptAsset — validated and structured
// raw.frontMatter: Record<string, unknown> — original YAML keys
// raw.body: string — markdown body
```

### `interpolate(template, variables, options?)`

Replace `{{ variable }}` placeholders with values.

```typescript
const result = interpolate('Hello {{ name }}!', { name: 'World' });
// 'Hello World!'

// Strict mode throws on missing variables
interpolate('{{ missing }}', {}, { strict: true });
// Error: Missing required variable: "missing"
```

### `extractVariables(template)`

Extract all variable names from a template string.

```typescript
const vars = extractVariables('{{ name }} works at {{ company }}');
// ['name', 'company']
```

### `resolveIncludes(asset, filePath)`

Resolve includes by reading and inlining referenced files.

```typescript
const resolved = await resolveIncludes(asset, '/path/to/prompt.md');
```

### `applyOverrides(asset, options)`

Apply environment, tier, and runtime overrides.

```typescript
const result = applyOverrides(asset, {
  environment: 'dev',
  tier: 'pro',
  runtime: { model: 'gpt-5.4-mini' },
});
```

### `validateAsset(asset, frontMatterKeys?, filePath?)`

Validate a parsed prompt asset.

```typescript
const result = validateAsset(asset, ['id', 'schema_version', 'model'], 'hello.md');
// { valid: boolean, errors: ValidationError[], warnings: ValidationError[] }
```

### `validateAssetWithIncludes(asset, filePath, frontMatterKeys?)`

Validate a prompt asset including its include graph (checks for missing files and circular includes).

```typescript
const result = await validateAssetWithIncludes(asset, '/path/to/prompt.md', ['id', 'model']);
```

### `getAdapter(provider)`

Get a provider adapter by name.

```typescript
const adapter = getAdapter('openai');
const validation = adapter.validate(resolvedAsset);
const request = adapter.render(resolvedAsset, { variables: { name: 'World' } });
```

## Standalone `renderPrompt`

A convenience wrapper that creates a temporary `PromptOpsKit` instance:

```typescript
import { renderPrompt } from 'promptopskit';

const result = await renderPrompt({
  source: '---\nid: inline\nschema_version: 1\n---\n\nHello {{ name }}!',
  provider: 'openai',
  variables: { name: 'World' },
  sourceDir: './prompts',  // defaults to '.'
});
```

## Types

Key types exported from `promptopskit`:

```typescript
import type {
  PromptAsset,
  ResolvedPromptAsset,
  ProviderRequest,
  RuntimeRenderOptions,
  ProviderAdapter,
  ValidationResult,
  PromptValidationResult,
  ValidationError,
  RenderedSections,
  RenderOptions,
  ParseResult,
  OverrideOptions,
} from 'promptopskit';
```
