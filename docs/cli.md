# CLI

PromptOpsKit includes a CLI for scaffolding, validating, compiling, rendering, inspecting, and deploying AI agent instructions.

```bash
npx promptopskit <command> [options]
```

## `init`

Scaffold a prompts directory with starter files.

```bash
promptopskit init [dir]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `dir` | `./prompts` | Target directory |

Creates:

```
prompts/
├── defaults.md         # Folder-level defaults (provider, model, metadata, system instructions)
├── hello.md            # Sample prompt with variables
├── hello.test.yaml     # Test sidecar with sample inputs
└── shared/
    └── tone.md         # Shared system instructions
```

Existing files are skipped. If a `package.json` exists, suggests adding a `build:prompts` script.

## `validate`

Validate all prompt `.md` files in a directory.

```bash
promptopskit validate <dir> [--strict]
```

| Option | Description |
|--------|-------------|
| `<dir>` | Directory to validate (required) |
| `--strict` | Treat warnings as errors (exit code 1) |

Checks:
- Zod schema validation against the prompt asset schema
- Missing required fields (`id`, body sections)
- Unknown front matter keys with Levenshtein-based "did you mean?" suggestions
- Variable usage — used but undeclared, declared but unused
- Include resolution — missing files, circular includes
- Folder defaults inheritance from `defaults.md` (provider, model, metadata, system instructions)

Output per file:
```
  ✓ prompts/hello.md
  ✗ prompts/broken.md
    POK001: Schema error at provider: Invalid enum value
    ⚠ POK010: Unknown front matter field: "tempreature" (Did you mean "temperature"?)
```

## `compile`

Compile `.md` prompt files to JSON or ESM artifacts.

```bash
promptopskit compile [src] [out] [--dry-run] [--format json|esm] [--no-clean]
```

| Option | Default | Description |
|--------|---------|-------------|
| `<src>` | `./prompts` | Source directory |
| `<out>` | `./.generated-prompts/json` | Output directory |
| `--source`, `-s` | — | Explicit source directory override |
| `--output`, `-o` | — | Explicit output directory override |
| `--format` | `json` | Output format: `json` or `esm` |
| `--dry-run` | — | Show what would be compiled without writing |
| `--no-clean` | — | Don't clear the output directory before compiling |

Includes are resolved during compilation so compiled artifacts are self-sufficient. The output directory is cleared by default before compiling (unless `--no-clean` is set).

If you omit `<out>`, the CLI chooses `./.generated-prompts/json` for `json` and `./.generated-prompts/esm` for `esm`.

`defaults.md` files are treated as configuration inputs and are not compiled as standalone prompts.

JSON format produces `.json` files:
```json
{
  "id": "hello",
  "schema_version": 1,
  "sections": { ... }
}
```

ESM format produces `.mjs` files:
```javascript
export default { "id": "hello", ... };
```

## `render`

Render a prompt preview with variables.

```bash
promptopskit render <file> [--env <name>] [--tier <name>] [--vars <file>] [--json]
```

| Option | Description |
|--------|-------------|
| `<file>` | Prompt `.md` file to render (required) |
| `--env <name>` | Environment override |
| `--tier <name>` | Tier override |
| `--vars <file>` | JSON file with variables |
| `--json` | Output raw JSON instead of readable format |

If no `--vars` file is provided, the command auto-loads a `.test.yaml` sidecar file (same name as the prompt, with `.test.yaml` extension) and uses the first test case's variables.

`--vars` keys map directly to placeholder names in `{{ name }}` syntax.

Readable output:
```
── support/reply (openai, gpt-5.4) ────────────────────────
System: You are a careful support assistant...
User:   Customer message: How do I reset my password?...
Tools:  get_account_status
Model:  gpt-5.4
────────────────────────────────────────────────────────────
```

## `inspect`

Print the fully resolved prompt asset as JSON.

```bash
promptopskit inspect <file>
```

Parses the file, resolves includes, and outputs the normalized asset. Useful for debugging what the library sees after parsing.

## `skill`

Deploy AI agent instructions into your project so coding assistants understand how to create and manage prompts.

```bash
promptopskit skill [--target agents|claude|copilot|cursor] [--force]
```

By default, generates files for **all** major AI coding assistants. Use `--target` to deploy only a specific one.

| Option | Default | Description |
|--------|---------|-------------|
| `--target` | all | Deploy only a specific target |
| `--force` | — | Overwrite entire file instead of merging |

If a target file already exists, the promptopskit section (wrapped in `<!-- promptopskit:start -->` / `<!-- promptopskit:end -->` markers) is replaced in-place or appended to the end. Use `--force` to overwrite the entire file.

Output locations:

| Target | File | Used by |
|--------|------|---------|
| `agents` | `AGENTS.md` | Codex, OpenCode, Cursor, Copilot |
| `claude` | `CLAUDE.md` | Claude Code (imports `AGENTS.md`) |
| `copilot` | `.github/instructions/promptopskit.instructions.md` | GitHub Copilot (path-specific) |
| `cursor` | `.cursor/rules/promptopskit.mdc` | Cursor (project rule) |

The deployed files cover the prompt format, front matter schema, variable interpolation, includes, overrides, the TypeScript API, provider adapters, and project conventions. The `CLAUDE.md` file uses the `@AGENTS.md` import syntax to avoid duplicating content.

## Global options

```bash
promptopskit --help       # Show help
promptopskit --version    # Show version
```
