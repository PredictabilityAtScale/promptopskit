# PromptOpsKit Docs

Open-source developer toolkit for managing prompts, system instructions, tools, and model settings **as code**. One `npm install` gives you both a runtime library and a CLI.

## Guides

- [Getting Started](./getting-started.md) — Install, scaffold, and render your first prompt
- [Prompt Format](./prompt-format.md) — Markdown structure, YAML front matter, H1 sections, variables, context hardening, and `defaults.md` inheritance
- [Composition](./composition.md) — Share system instructions across prompts with `includes`
- [Overrides](./overrides.md) — Environment and tier-based overrides for dev/prod/free/pro
- [Providers](./providers.md) — Provider adapters for OpenAI, Anthropic, Gemini, OpenRouter, and LLMAsAService
- [UsageTap](./usagetap.md) — Optional begin/end call tracking and entitlement-aware provider helpers for UsageTap.com
- [Inline Source](./inline-source.md) — Render prompts from strings without files

## Reference

- [CLI](./cli.md) — Command-line interface: init, validate, compile, render, inspect, skill
- [API Reference](./api-reference.md) — TypeScript API: `createPromptOpsKit`, `renderPrompt`, standalone functions
- [Schema](./schema.md) — Full YAML front matter schema reference
- [Response Schema DX](./schema-dx.md) — Design proposal for sharing one response schema between prompt files and runtime validation code
- [Vendor Schema Gap Analysis](./vendor-schema-gap-analysis.md) — Snapshot comparison against published OpenAI, Anthropic, Gemini, OpenRouter, and LLMAsAService gateway schema capabilities
- [Testing](./testing.md) — Test helpers, mock assets, and sidecar test files
- [Validation](./validation.md) — Schema validation, "did you mean?" suggestions, variable checks, early regex validation, and YAML regex quoting guidance

## Also see

- [README](../README.md) — Project overview and quick reference
