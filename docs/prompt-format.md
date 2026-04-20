# Prompt Format

Every prompt is a Markdown file with two parts: **YAML front matter** for settings and **H1 headings** that separate the body into named sections.

## Structure

```markdown
---
id: support.reply
schema_version: 1
provider: openai
model: gpt-5.4
sampling:
  temperature: 0.7
context:
  inputs:
    - user_message
---

# System instructions

You are a helpful support assistant.

# Prompt template

{{ user_message }}

# Notes

Internal notes — ignored by the renderer.
```

## Front matter

The YAML block between `---` delimiters defines model settings, provider, sampling parameters, tools, overrides, and metadata. See the [Schema](./schema.md) page for every supported field.

Required fields:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the prompt (e.g. `support.reply`) |
| `schema_version` | Schema version — currently `1` |

## Folder defaults (`defaults.md`)

You can define shared defaults for an entire prompt tree by adding a `defaults.md` file in any folder.

- `defaults.md` values apply to all prompts in that folder and subfolders.
- Subfolders can define their own `defaults.md`; nearest (most local) values win.
- Only missing prompt values are filled from defaults (explicit prompt values always take precedence).
- Included files (`includes`) are **not** affected by folder defaults — only the top-level prompt inherits.

Supported default fields:

- `provider` (front matter) — default provider for the folder
- `model` (front matter) — default model for the folder
- `metadata` (front matter) — merged with prompt-local metadata
- `# System instructions` (body section) — used when the prompt has none

This lets you configure app-wide settings like `provider` and `model` in a single place. Individual prompts only need to declare what's unique to them.

Example:

```text
prompts/
├── defaults.md          # global settings, metadata + system instructions
└── support/
    ├── defaults.md      # overrides for support/*
    └── reply.md         # inherits from support/defaults.md
```

`prompts/defaults.md`:

```markdown
---
provider: openai
model: gpt-5.4
metadata:
  owner: platform
  review_required: true
---

# System instructions

Follow company-wide safety policy.
```

`prompts/support/defaults.md`:

```markdown
---
metadata:
  owner: support
---

# System instructions

Use support tone and escalation policy.
```

`prompts/support/reply.md` (no local `metadata.owner` and no local system section) will use:
- `provider: openai` (inherited from root defaults)
- `model: gpt-5.4` (inherited from root defaults)
- `metadata.owner: support` (nearest override)
- `metadata.review_required: true` (inherited from parent defaults)
- system instructions from `support/defaults.md`

## Sections

The Markdown body is split on **H1 headings** into named sections. Three section names are recognized (case-insensitive):

| Heading | Key | Purpose |
|---------|-----|---------|
| `# System instructions` | `system_instructions` | System message sent to the model |
| `# Prompt template` | `prompt_template` | User message template with variables |
| `# Notes` | `notes` | Internal documentation — not rendered |

Rules:

- H2 and deeper headings inside a section are treated as content, not as section boundaries.
- If no H1 headings are found, the entire body is treated as `prompt_template`.
- Both `# System instructions` and `# Prompt template` are optional — but at least one must exist for the prompt to be valid.

## Variables

Use `{{ mustache }}` syntax for variable interpolation:

```markdown
# Prompt template

Hello {{ name }}, welcome to {{ company }}.
Runtime context: {{ app_context }}.
```

Variable names must match `[a-zA-Z_][a-zA-Z0-9_]*`.

### Strict vs. permissive mode

| Mode | Behavior on missing variable |
|------|-----|
| **Permissive** (default) | Leaves `{{ placeholder }}` intact in the output |
| **Strict** | Throws an error |

Enable strict mode by passing `strict: true` to `renderPrompt()`.

### Escaping

To produce a literal `{{` in the output, escape it:

```markdown
Use \{\{ to write template syntax.
```

### Declaring inputs

Declare expected variables in `context.inputs` for validation:

```yaml
context:
  inputs:
    - name
    - company
    - app_context
```

The validator warns about:
- Variables used in templates but not declared in `context.inputs`
- Variables declared in `context.inputs` but never used

## Minimal example

The simplest valid prompt:

```markdown
---
id: greet
schema_version: 1
---

Hello {{ name }}!
```

No H1 headings — the body becomes the `prompt_template` section automatically.

## Full example

A production-ready prompt using all major features:

```markdown
---
id: support.reply
schema_version: 1
provider: openai
model: gpt-5.4
fallback_models:
  - gpt-5.4-mini
reasoning:
  effort: medium
sampling:
  temperature: 0.7
  max_output_tokens: 2048
response:
  format: text
context:
  inputs:
    - user_message
    - account_summary
  history:
    max_items: 8
tools:
  - get_account_status
includes:
  - ../shared/tone.md
environments:
  dev:
    model: gpt-5.4-mini
    reasoning:
      effort: low
  prod:
    model: gpt-5.4
tiers:
  free:
    model: gpt-5.4-mini
  pro:
    model: gpt-5.4
metadata:
  owner: support-platform
  review_required: true
---

# System instructions

You are a careful support assistant. Follow refund policy exactly.

# Prompt template

Customer message:
{{ user_message }}

Account summary:
{{ account_summary }}
```
