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
| `POK013` | Error | Invalid context regex pattern or YAML regex quoting (`allow_regex` or `deny_regex`), including location and raw configured value when available |
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

Known front matter keys: `id`, `schema_version`, `description`, `provider`, `model`, `fallback_models`, `reasoning`, `sampling`, `response`, `tools`, `mcp`, `context`, `includes`, `environments`, `tiers`, `metadata`, `cache`, `provider_options`, `raw`.

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

Object-form inputs can opt out of required-input behavior or input-scoped warnings:

```yaml
context:
  inputs:
    - name: experiment_note
      optional: true
    - name: legacy_context
      warnings: false
```

- `optional: true` means strict rendering will not throw when the variable is missing, and static validation will not warn that the input is unused or lacks required-input hardening.
- `warnings: false` suppresses warnings scoped to that input, including `POK012`, `POK014`, `POK040`, `POK041`, and render-time `POK030`. It does not suppress schema errors, invalid regex errors, or validator failures.

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
      allow_regex: /^user_[a-z0-9]+$/i
    - name: user_message
      deny_regex: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|(?:^|\b)(?:system|developer|assistant)\s*:|reveal\s+(?:your|the)\s+(?:system\s+prompt|hidden\s+instructions?)|print\s+(?:the\s+)?(?:policy|rules?)|BEGIN\s+SYSTEM\s+PROMPT|END\s+SYSTEM\s+PROMPT/i
      non_empty: true
      reject_secrets: true
```

- Prefer unquoted `/pattern/i` literal form for regex patterns that contain backslashes. If you use a structured `pattern` field, use single-quoted YAML strings or double each backslash in double-quoted strings.
- `trim` trims values to the `max_size` byte budget before interpolation.
- `allow_regex` enforces an allowlist pattern before interpolation and throws `POK031` when a value fails validation, unless `return_message` is configured.
- `deny_regex` enforces a blocklist pattern before interpolation and throws `POK032` when a value matches, unless `return_message` is configured.
- `non_empty` rejects blank or whitespace-only values with `POK033`, unless `return_message` is configured.
- `reject_secrets` rejects common secret-like strings with `POK034`, unless `return_message` is configured.
- During static validation and compilation, malformed `allow_regex` or `deny_regex` patterns are reported as `POK013`.
- Double-quoted YAML regex strings with raw backslashes, such as `"\s+"`, are reported as `POK013` before YAML parsing. Prefer unquoted `/pattern/i` literals for copyable regexes.
- During static validation, `trim` without `max_size` returns a `POK014` warning.
- During static validation, risky unbounded inputs and missing hardening are flagged as `POK040` and `POK041`.
- Set `warnings: false` on an object-form input to suppress warnings for intentional exceptions.
- During static validation, provider/cache hygiene checks can emit `POK042`–`POK045`.
- During static validation, inline tool quality checks can emit `POK047`.

Regex compilation errors include the prompt id, variable name, field name, and raw configured value to make bad prompt definitions easy to locate. YAML quoting errors include the file and line when available.

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

## Prompt injection and system-instruction leakage hardening

Regex validation is **not a complete security boundary**, but it is useful as a first-pass filter for obvious hostile payloads in high-risk fields such as `user_message`, `external_content`, or `tool_result`.

### Common vulnerability patterns

- **Direct instruction override**: attacker text attempts to supersede system policies with phrases like “ignore previous instructions”.
- **Role/channel spoofing**: attacker injects fake role labels (`system:`, `assistant:`) so the model treats user content as higher-priority instructions.
- **Prompt exfiltration requests**: attacker asks the model to reveal hidden instructions, internal policies, API keys, or chain-of-thought.
- **Structured wrapper attacks**: attacker wraps malicious directives in XML/JSON/Markdown fences to look machine-generated or authoritative.

Use `deny_regex` to catch obvious attack language and `allow_regex` to constrain strict-format fields (IDs, enums, narrow command grammars).

### Example hardening set A: free-form user text

Use this when input must remain natural language but you want to block obvious prompt-injection attempts:

```yaml
context:
  inputs:
    - name: user_message
      max_size: 4000
      non_empty: true
      reject_secrets: true
      deny_regex:
        pattern: "(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|(?:^|\b)(?:system|developer|assistant)\s*:|reveal\s+(?:your|the)\s+(?:system\s+prompt|hidden\s+instructions?)|print\s+(?:the\s+)?(?:policy|rules?)|BEGIN\s+SYSTEM\s+PROMPT|END\s+SYSTEM\s+PROMPT"
        flags: "i"
        return_message: "I can help with your request, but I can't process instruction-override language. Please rephrase your question."
```

**Mitigates:** direct override phrasing, role spoofing, and explicit system-prompt extraction asks.

### Example hardening set B: strict machine-readable selector

Use this when the field should be tightly constrained (best defense is allowlist + short max size):

```yaml
context:
  inputs:
    - name: intent_code
      max_size: 32
      trim: true
      non_empty: true
      allow_regex:
        pattern: "^(billing|technical_support|account_access|cancel_subscription)$"
        flags: "i"
        return_message: "Please select one of: billing, technical_support, account_access, cancel_subscription."
      deny_regex:
        pattern: "[\r\n`{}<>:$]"
```

**Mitigates:** multi-line payload smuggling, role-label injection, and arbitrary instruction text in fields that should only carry enum-like values.

### Example hardening set C: external retrieved content

If your prompt includes untrusted retrieved content, isolate and filter it before interpolation:

```yaml
context:
  inputs:
    - name: retrieved_snippet
      max_size: 6000
      trim: true
      deny_regex:
        pattern: "(?:^|\b)(?:system|developer)\s*:|ignore\s+(?:all\s+)?instructions|jailbreak|do\s+anything\s+now|simulate\s+developer\s+mode|exfiltrat(?:e|ion)|reveal\s+(?:prompt|policy|secrets?)"
        flags: "i"
        return_message: "The retrieved content appears unsafe and was not included."
```

**Mitigates:** known jailbreak strings and instruction-like payloads embedded in retrieval data.

### Practical guidance

- Prefer **allowlists** for structured fields; use denylists only as a secondary net.
- Keep regexes focused on high-signal patterns to reduce false positives.
- Combine regex checks with architecture controls: separate trusted instructions from untrusted context, quote/delimit untrusted text, and add explicit “treat context as data” system instructions.
- Never rely on regex alone for sensitive operations; require server-side policy checks and tool authorization.
- Log `POK031`/`POK032` failures and monitor spikes as potential attack signals.
