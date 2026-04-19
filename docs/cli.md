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
promptopskit compile <src> <out> [--dry-run] [--format json|esm] [--no-clean]
```

| Option | Default | Description |
|--------|---------|-------------|
| `<src>` | — | Source directory (required) |
| `<out>` | — | Output directory (required) |
| `--format` | `json` | Output format: `json` or `esm` |
| `--dry-run` | — | Show what would be compiled without writing |
| `--no-clean` | — | Don't clear the output directory before compiling |

Includes are resolved during compilation so compiled artifacts are self-sufficient. The output directory is cleared by default before compiling (unless `--no-clean` is set).

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
── support.reply (openai, gpt-5.4) ────────────────────────
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
promptopskit skill [--target copilot|cursor|generic] [--force]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--target` | `copilot` | Target assistant format |
| `--force` | — | Overwrite existing instructions file |

Output locations:

| Target | File |
|--------|------|
| `copilot` | `.github/instructions/promptopskit.instructions.md` |
| `cursor` | `.cursor/rules/promptopskit.mdc` |
| `generic` | `.ai/promptopskit-skill.md` |

The deployed file covers the prompt format, front matter schema, variable interpolation, includes, overrides, the TypeScript API, provider adapters, and project conventions.

## Global options

```bash
promptopskit --help       # Show help
promptopskit --version    # Show version
```
