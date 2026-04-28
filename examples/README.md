# PromptOpsKit Example Library

This folder contains a small, validation-safe set of prompt examples that demonstrate the main PromptOpsKit features and front matter schema.

## Layout

- `prompts/defaults.md` — folder defaults (provider/model/metadata/system instructions)
- `prompts/shared/` — reusable includes used by composition examples
- `prompts/*.md` — standalone examples with a `# Notes` section

## Validate all examples

```bash
npm run build
node dist/cli/index.js validate examples/prompts
```

## Optional: inspect or render a single example

```bash
node dist/cli/index.js inspect examples/prompts/03-composition-includes.md
node dist/cli/index.js render examples/prompts/05-response-schema-json.md --json
```
