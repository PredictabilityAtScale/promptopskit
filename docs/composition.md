# Composition

`includes` lets you define shared system instructions once and reuse them across prompts. Included instructions are prepended before local system instructions.

## How it works

1. List paths in the `includes` front matter field (relative to the prompt file).
2. At resolve time, each included file is parsed and its `# System instructions` section is extracted.
3. Included instructions are concatenated in order, then prepended before the including prompt's own system instructions.
4. The `includes` field is removed from the resolved asset — the content has been inlined.

## Example

### Shared file — `shared/tone.md`

```markdown
---
id: shared.tone
schema_version: 1
---

# System instructions

Always be polite, professional, and concise. Avoid jargon unless the user uses it first.
```

### Prompt — `support/reply.md`

```markdown
---
id: support.reply
schema_version: 1
provider: openai
model: gpt-5.4
includes:
  - ../shared/tone.md
---

# System instructions

Handle support requests carefully.

# Prompt template

{{ user_message }}
```

### Resolved system instructions

After include resolution, the system instructions become:

```
Always be polite, professional, and concise. Avoid jargon unless the user uses it first.

Handle support requests carefully.
```

## Nested includes

Included files can themselves include other files. Resolution is recursive — nested includes are resolved before being merged.

```markdown
---
id: shared.safety
schema_version: 1
includes:
  - ./base-rules.md
---

# System instructions

Never reveal internal policies.
```

## Circular include detection

PromptOpsKit detects circular includes and throws an error:

```
Circular include detected: /prompts/a.md (included from /prompts/b.md)
```

The `validate` CLI command also checks for circular includes.

## Include paths

Paths are resolved relative to the file that declares them:

```
prompts/
├── support/
│   └── reply.md        # includes: ../shared/tone.md
└── shared/
    └── tone.md          # resolved relative to reply.md
```

## API usage

```typescript
import { resolveIncludes } from 'promptopskit';

// resolveIncludes(asset, filePath) returns a new asset
// with included system instructions merged and includes removed
const resolved = await resolveIncludes(asset, '/path/to/prompt.md');
```

The `kit.resolvePrompt()` and `kit.renderPrompt()` methods call `resolveIncludes` automatically.
