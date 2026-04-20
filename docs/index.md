# PromptOpsKit Docs

Open-source developer toolkit for managing prompts, system instructions, tools, and model settings **as code**. One `npm install` gives you both a runtime library and a CLI.

## Guides

- [Getting Started](./getting-started.md) — Install, scaffold, and render your first prompt
- [Prompt Format](./prompt-format.md) — Markdown structure, YAML front matter, H1 sections, variables, and `defaults.md` inheritance
- [Composition](./composition.md) — Share system instructions across prompts with `includes`
- [Overrides](./overrides.md) — Environment and tier-based overrides for dev/prod/free/pro
- [Providers](./providers.md) — Provider adapters for OpenAI, Anthropic, Gemini, and OpenRouter
- [Inline Source](./inline-source.md) — Render prompts from strings without files

## Reference

- [CLI](./cli.md) — Command-line interface: init, validate, compile, render, inspect, skill
- [API Reference](./api-reference.md) — TypeScript API: `createPromptOpsKit`, `renderPrompt`, standalone functions
- [Schema](./schema.md) — Full YAML front matter schema reference
- [Testing](./testing.md) — Test helpers, mock assets, and sidecar test files
- [Validation](./validation.md) — Schema validation, "did you mean?" suggestions, variable checks

## Also see

- [README](../README.md) — Project overview and quick reference
