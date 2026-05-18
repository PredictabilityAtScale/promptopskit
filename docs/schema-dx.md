# Response Schema DX: Author Once, Use in Prompt + Code

This proposal describes how PromptOpsKit can let teams define a response schema once and use it in:

1. Prompt front matter (`response.schema`), and
2. Runtime TypeScript validation/parsing.

## Goals

- **Single source of truth** for structured output contracts.
- **Low-friction authoring** (no mandatory codegen for simple teams).
- **Strong typing** in application code for teams that want it.
- **Portable behavior** across providers that support JSON Schema.
- **Incremental adoption** without breaking existing prompts.

## Recommended design

Use a **three-lane model** so users can choose complexity level.

### Lane A: Inline schema (existing behavior)

Keep current `response.schema` behavior unchanged.

Best for:
- quick experiments
- one-off prompts
- teams without build tooling

### Lane B: External schema file references (new)

Allow prompt front matter to reference a schema asset file.

Example:

```yaml
response:
  format: json
  schema_ref: ./schemas/support-reply.schema.json
  schema_name: support_reply
  schema_strict: true
```

Resolution rules:
- `schema_ref` is resolved relative to the prompt file.
- File must be JSON Schema object.
- Compiler inlines resolved schema into compiled prompt output for providers.

Why this helps DX:
- keeps prompts readable
- enables sharing schema across multiple prompts
- lets app code import the same schema file directly

### Lane C: Optional codegen for typed validators (new, opt-in)

Add an optional command:

```bash
promptopskit schema generate
```

This command can emit:
- `*.schema.json` copies (or normalized forms)
- TS validator modules (e.g. Zod/Valibot wrappers)
- inferred TS types for app code

Why optional:
- some teams only need raw JSON Schema + Ajv
- others want end-to-end typed contracts

## Authoring/usage patterns

### Pattern 1: JSON Schema + Ajv (minimal dependencies)

- Define schema in `*.schema.json`.
- Reference it from prompt via `schema_ref`.
- In app runtime, import same JSON schema into Ajv to validate model output.

Pros: simplest, ecosystem-standard.

### Pattern 2: Type-first (Zod) with schema export

- Define schema in code (`z.object(...)`).
- Export JSON Schema artifact during build (`zod-to-json-schema`).
- Prompt references generated JSON file.

Pros: strong TS ergonomics.
Cons: build step required.

### Pattern 3: Schema-first with generated TS types

- Define `*.schema.json`.
- Generate TS types and/or validators.

Pros: prompt and runtime both consume same source.

## Proposed front matter additions

Under `response`:

- `schema_ref?: string` — path to external JSON Schema file or zod module.
- Keep existing `schema?: object`.
- Validation rule: exactly one of `schema` or `schema_ref` should be provided.

Potential future extension:

- `schema_ref_name?: string` for referencing named schemas from a registry file.

## Compiler/runtime behavior

1. Parser reads prompt.
2. If `schema_ref` exists, loader resolves and loads schema source (`.json` or zod module).
3. Validate schema is object-shaped JSON.
4. Normalize to internal `response.schema`.
5. Continue provider mapping unchanged.

This preserves downstream adapter logic and minimizes invasive changes.

## CLI UX

### `compile`

- Include resolved schema in compiled artifact.
- Include source metadata:
  - `response.schema_source.resolved_path`
  - `response.schema_source.hash` (optional)

### `validate`

- Verify referenced schema file exists.
- Validate JSON parse + object shape.
- Warn on unsupported JSON Schema constructs per provider (best-effort).

### `inspect`

- Show whether schema is inline or file-based.
- Display resolved path and size/hash.

## Error messages (important for DX)

Make messages actionable:

- `POK050: response.schema_ref "./schemas/reply.json" not found (resolved from prompts/support/reply.md)`
- `POK050: response.schema_ref "./schemas/reply.json" must resolve to a JSON object schema`
- `POK051: zod schema modules must export a Zod schema as default export or named export "schema"`
- `POK051: response.schema_ref "./schemas/reply.schema.ts" has unsupported extension ".ts". Use .json, .js, .mjs, or .cjs`
- `response.schema and response.schema_ref are mutually exclusive`

## Migration strategy

- No breaking changes for existing prompts.
- Teams can migrate prompt-by-prompt:
  1. move inline schema to file
  2. replace `schema` with `schema_ref`
  3. run `promptopskit validate`

## Recommendation

`schema_ref` (Lane B) is now implemented.

Next step: evaluate **Lane C** (optional codegen) once real user needs clarify:
- target validator libs
- desired output layout
- monorepo integration expectations

This sequencing maximizes immediate DX value with low maintenance cost.


## Security note for executable schema modules

`schema_ref` supports executable JS modules (`.js/.mjs/.cjs`) for zod exports. These modules are imported during load/validate/compile, so only reference trusted repository code.
