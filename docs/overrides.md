# Overrides

Environment and tier overrides let the same prompt target dev vs. prod or free vs. pro without duplicating files.

## Precedence

Overrides are applied in this order — later layers win:

**base → environment → tier → runtime**

Scalars and arrays are **replaced**, not merged.

## Defining overrides

Declare `environments` and `tiers` in front matter. Each key maps to a set of overridable fields:

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

## Overridable fields

Only these fields can be overridden in `environments` and `tiers`:

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | Model name |
| `fallback_models` | `string[]` | Fallback model list |
| `reasoning` | `object` | `{ effort, budget_tokens }` |
| `sampling` | `object` | `{ temperature, top_p, frequency_penalty, presence_penalty, stop, max_output_tokens }` |
| `response` | `object` | `{ format, stream, schema, schema_ref, schema_name, schema_description, schema_strict }` |
| `compression` | `object` | Prompt-template compression controls (`thetokencompany`, `heuristic`, `code`) |
| `cache` | `object` | Provider-specific cache controls (`openai`, `anthropic`, `gemini`/`google`) |
| `raw` | `object` | Provider-specific request-body passthrough blocks |
| `tools` | `array` | Tool references |
| `provider_options` | `object` | Provider-specific advanced options (`anthropic`, `gemini`, `openrouter`, `llmasaservice`) |

Object fields (`reasoning`, `sampling`, `response`, `compression`, `cache`, `raw`, `provider_options`) are shallow-merged — individual sub-fields are replaced, but you don't need to repeat every sub-field.

## Applying overrides

### Via `renderPrompt`

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  environment: 'dev',
  tier: 'pro',
  variables: { user_message: '...' },
});
```

With the config above and `environment: 'dev', tier: 'pro'`:

1. **Base**: `model: gpt-5.4`, `reasoning.effort: high`, `temperature: 0.7`
2. **Environment (dev)**: `model: gpt-5.4-mini`, `reasoning.effort: low`, `temperature: 0.2`
3. **Tier (pro)**: `model: gpt-5.4` (overrides dev)

Result: `model: gpt-5.4`, `reasoning.effort: low`, `temperature: 0.2`

### Via `resolvePrompt`

```typescript
const resolved = await kit.resolvePrompt('support/reply', {
  environment: 'dev',
  tier: 'pro',
});
```

### Via standalone function

```typescript
import { applyOverrides } from 'promptopskit';

const result = applyOverrides(asset, {
  environment: 'dev',
  tier: 'pro',
});
```

## Runtime overrides

The `applyOverrides` function also accepts a `runtime` parameter for programmatic overrides applied after environment and tier:

```typescript
import { applyOverrides } from 'promptopskit';

const result = applyOverrides(asset, {
  environment: 'prod',
  runtime: {
    model: 'gpt-5.4-mini',
    sampling: { temperature: 0 },
  },
});
```

## CLI

The `render` command supports `--env` and `--tier` flags:

```bash
promptopskit render support/reply.md --env dev --tier pro
```
