# Validation

PromptOpsKit validates prompts at multiple levels — schema structure, front matter keys, variable usage, and include graphs.

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

## Error codes

| Code | Severity | Description |
|------|----------|-------------|
| `POK001` | Error | Zod schema validation failure |
| `POK002` | Error | Missing required `id` field |
| `POK003` | Error | No body sections (needs at least `# System instructions` or `# Prompt template`) |
| `POK010` | Warning | Unknown front matter key (with "did you mean?" suggestion) |
| `POK011` | Warning | Variable used in template but not declared in `context.inputs` |
| `POK012` | Warning | Variable declared in `context.inputs` but never used |
| `POK020` | Error | Include resolution failed (missing file) |
| `POK021` | Error | Circular include detected |

## "Did you mean?" suggestions

Unknown front matter keys are checked against known keys using Levenshtein distance. If a close match is found (distance ≤ 3), a suggestion is shown:

```
⚠ POK010: Unknown front matter field: "tempreature" (Did you mean "temperature"?)
```

Known front matter keys: `id`, `schema_version`, `description`, `provider`, `model`, `fallback_models`, `reasoning`, `sampling`, `response`, `tools`, `mcp`, `context`, `includes`, `environments`, `tiers`, `metadata`.

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
