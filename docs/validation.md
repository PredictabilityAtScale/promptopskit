# Validation

PromptOpsKit validates prompts at multiple levels — schema structure, front matter keys, variable usage, context regex compilation, and include graphs. Render-time context size limits are checked separately during prompt rendering.

## Quick start

### CLI

```bash
promptopskit validate ./prompts
promptopskit validate ./prompts --strict
```

### API

```typescript
const result = await kit.validatePrompt('support/reply');
// { valid: boolean, errors: ValidationError[], warnings: ValidationError[] }
```

`validatePrompt()` does not execute render-time context size checks. Those warnings are produced by `renderPrompt()` when variables are provided.

## Render-time warnings

`renderPrompt()` can emit `POK030` when a provided variable exceeds the `max_size` declared for a context input.

## Error codes

| Code | Severity | Description |
|------|----------|-------------|
| `POK001` | Error | Zod schema validation failure |
| `POK002` | Error | Missing required `id` field |
| `POK003` | Error | No body sections (needs at least `# System instructions` or `# Prompt template`) |
| `POK010` | Warning | Unknown front matter key (with "did you mean?" suggestion) |
| `POK011` | Warning | Variable used in template but not declared in `context.inputs` |
| `POK012` | Warning | Variable declared in `context.inputs` but never used |
| `POK013` | Error | Invalid context regex pattern (`allow_regex` or `deny_regex`), including prompt id, variable name, field name, and raw configured value |
| `POK014` | Warning | `trim` configured without `max_size` (trim-to-budget skipped) |
| `POK040` | Warning | Risky context input appears unbounded (`max_size` missing) |
| `POK041` | Warning | Context input has no hardening validators (`allow/deny regex`, `non_empty`, `reject_secrets`) |
| `POK042` | Warning | Provider has no provider-specific cache config |
| `POK043` | Warning | `cache.gemini.cached_content` and `cache.google.cached_content` conflict |
| `POK044` | Warning | Provider configured without an explicit `model` |
| `POK045` | Warning | Environment/tier cache override may be missing while base cache is defined |
| `POK046` | Warning | Template uses variables but `context.inputs` is not declared |
| `POK047` | Warning | Inline tool definition missing `description` or `input_schema` |
| `POK033` | Runtime error | `non_empty` validation failed |
| `POK034` | Runtime error | `reject_secrets` validation matched |
| `POK020` | Error | Include resolution failed (missing file) |
| `POK021` | Error | Circular include detected |

## "Did you mean?" suggestions

Unknown front matter keys are checked against known keys using Levenshtein distance. If a close match is found (distance ≤ 3), a suggestion is shown:

```
⚠ POK010: Unknown front matter field: "tempreature" (Did you mean "temperature"?)
```

Known front matter keys: `id`, `schema_version`, `description`, `provider`, `model`, `fallback_models`, `reasoning`, `sampling`, `response`, `tools`, `mcp`, `context`, `includes`, `environments`, `tiers`, `metadata`, `cache`, `provider_options`.

## Variable validation

When `context.inputs` is declared, the validator cross-references it with variables actually used in `# System instructions` and `# Prompt template`:

```yaml
context:
  inputs:
    - name
    - unused_var    # POK012 warning: declared but never used
```

```markdown
# Prompt template

Hello {{ name }} from {{ company }}!   <!-- POK011 warning: company used but not declared -->
```

Object-form inputs can also declare size limits:

```yaml
context:
  inputs:
    - name: account_summary
      max_size: 4096
```

If `account_summary` is rendered with a value larger than 4096 UTF-8 bytes, `renderPrompt()` returns a `POK030` warning. In source and auto modes, PromptOpsKit also writes the warning to `console.warn` so oversized context is visible during local development.

If you want to transform oversized values before warnings/rendering (for example, summarize or redact), pass `onContextOverflow` at render time:

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables: { account_summary: veryLargeText },
  onContextOverflow: ({ variable, value, maxSize }) =>
    `${variable} truncated to fit ${maxSize} bytes: ${value.slice(0, 50)}...`,
});
```

You can also add basic input hardening directly in `context.inputs`:

```yaml
context:
  inputs:
    - name: user_id
      trim: true
      allow_regex:
        pattern: "^user_[a-z0-9]+$"
        flags: "i"
    - name: user_message
      deny_regex: "/(ignore previous instructions|system:)/i"
      non_empty: true
      reject_secrets: true
```

- `trim` trims values to the `max_size` byte budget before interpolation.
- `allow_regex` enforces an allowlist pattern before interpolation and throws `POK031` when a value fails validation, unless `return_message` is configured.
- `deny_regex` enforces a blocklist pattern before interpolation and throws `POK032` when a value matches, unless `return_message` is configured.
- `non_empty` rejects blank or whitespace-only values with `POK033`, unless `return_message` is configured.
- `reject_secrets` rejects common secret-like strings with `POK034`, unless `return_message` is configured.
- During static validation and compilation, malformed `allow_regex` or `deny_regex` patterns are reported as `POK013`.
- During static validation, `trim` without `max_size` returns a `POK014` warning.
- During static validation, risky unbounded inputs and missing hardening are flagged as `POK040` and `POK041`.
- During static validation, provider/cache hygiene checks can emit `POK042`–`POK045`.
- During static validation, inline tool quality checks can emit `POK047`.

Regex compilation errors include the prompt id, variable name, field name, and raw configured value to make bad prompt definitions easy to locate.

If a validator declares `return_message`, `renderPrompt()` returns that message in a structured result and omits the provider request instead of throwing.

Context size warning emission is configured separately at the kit level:

```typescript
const kit = createPromptOpsKit({
  sourceDir: './prompts',
  warnings: {
    contextSize: 'off',
  },
});
```

`warnings.contextSize` supports:

- `auto` — default behavior; include in `renderPrompt().warnings`, and log to console outside `compiled-only`
- `off` — suppress context size warnings entirely
- `result-only` — return warnings but do not log them
- `console` — log warnings but do not include them in the returned `warnings` array
- `console-and-result` — log and return warnings in all modes

## Include validation

`validateAssetWithIncludes` resolves the full include graph and catches:

- **Missing files**: `POK020 — Include resolution failed`
- **Circular includes**: `POK021 — Circular include detected`

```typescript
import { validateAssetWithIncludes } from 'promptopskit';

const result = await validateAssetWithIncludes(asset, '/path/to/prompt.md', frontMatterKeys);
```

## Strict mode

Pass `--strict` to the CLI to treat warnings as errors — the command exits with code 1 if any warnings are present.

## Standalone functions

```typescript
import { validateAsset, validateAssetWithIncludes } from 'promptopskit';

// Basic validation (no include resolution)
const result = validateAsset(asset, frontMatterKeys, filePath);

// Full validation including include graph
const result = await validateAssetWithIncludes(asset, filePath, frontMatterKeys);
```

Both return:

```typescript
interface PromptValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

interface ValidationError {
  code: string;
  message: string;
  filePath?: string;
  suggestion?: string;
}
```
