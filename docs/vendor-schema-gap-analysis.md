# Vendor Schema Gap Analysis (as of April 25, 2026)

This page compares PromptOpsKit's prompt front-matter schema with currently published vendor API schema capabilities.

Primary references:

- OpenAI Responses API + structured outputs + prompt caching:
  - https://platform.openai.com/docs/api-reference/responses/create
  - https://platform.openai.com/docs/api-reference/chat/create
  - https://platform.openai.com/docs/guides/structured-outputs
  - https://platform.openai.com/docs/guides/prompt-caching
- Anthropic Messages API + prompt caching:
  - https://platform.claude.com/docs/en/api/messages
  - https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Gemini API generation + structured output + caching:
  - https://ai.google.dev/api/generate-content
  - https://ai.google.dev/gemini-api/docs/structured-output
  - https://ai.google.dev/api/caching
- OpenRouter structured outputs + caching:
  - https://openrouter.ai/docs/features/structured-outputs
  - https://openrouter.ai/docs/features/prompt-caching

## Snapshot of current PromptOpsKit schema surface

PromptOpsKit currently models:

- Portable prompt settings (`reasoning`, `sampling`, `response`, `tools`, `context`).
- Provider-specific options in `provider_options` (`anthropic`, `gemini`).
- Provider-specific cache controls in `cache` (`openai`, `anthropic`, `gemini` / `google`).

See [`docs/schema.md`](./schema.md) and [`src/schema/schema.ts`](../src/schema/schema.ts).

## Gap analysis

### OpenAI

| Area | Vendor capability | PromptOpsKit status | Gap |
|---|---|---|---|
| Structured outputs | `response_format: { type: "json_schema", json_schema: { name, schema, strict, description? } }` | Supported via `response.schema`, `response.schema_name`, `response.schema_strict` | **Partial**: PromptOpsKit does not expose schema-level `description`. |
| Chat vs Responses schema parity | OpenAI publishes both Chat Completions and Responses request shapes | PromptOpsKit has dedicated adapters for both (`openai` + `openai-responses`) with shared portable `response.schema*` mapping | **Partial**: API-specific fields are intentionally not fully modeled in front matter. |
| Responses conversation threading checks | Responses supports `conversation` and `previous_response_id` threading fields | PromptOpsKit exposes both via runtime `openaiResponses` options and validates they are mutually exclusive | **Partial**: validation is runtime adapter logic, not a front-matter schema construct. |
| Prompt caching | `prompt_cache_key`, `prompt_cache_retention` (`in_memory` / `24h`) | Supported via `cache.openai.prompt_cache_key`, `cache.openai.retention` | No significant gap. |
| Streaming | `stream` in request body | Supported via `response.stream` for OpenAI adapters | No significant gap. |

### Anthropic

| Area | Vendor capability | PromptOpsKit status | Gap |
|---|---|---|---|
| Prompt caching | Top-level automatic caching + explicit block `cache_control` with `type`/`ttl` | Supported via `cache.anthropic.mode`, `type`, `ttl`, and explicit block toggles | **Operational note**: 1h cache behavior may require vendor beta/version headers controlled by caller. |
| Tool choice / sampling extras | `tool_choice`, `top_k` | Supported via `provider_options.anthropic` | No significant gap. |
| Structured outputs | Anthropic now documents structured outputs capabilities | PromptOpsKit currently warns that `response.schema` is ignored for Anthropic | **Gap**: no first-class Anthropic structured-output mapping yet. |

### Gemini (Google)

| Area | Vendor capability | PromptOpsKit status | Gap |
|---|---|---|---|
| Structured outputs | `generationConfig.responseSchema` and JSON-schema alternatives | Supported via `response.schema` and `provider_options.gemini.response_schema` | **Partial**: PromptOpsKit does not expose a dedicated `response_json_schema` field for Gemini's JSON-schema-specific alternative. |
| Streaming | Endpoint-based streaming (`streamGenerateContent`) with same request schema | PromptOpsKit warns and ignores `response.stream` for Gemini adapter body | **Gap**: no endpoint-switch abstraction based on `response.stream`. |
| Caching | Managed cached resources (`cachedContents`) and request reuse via `cachedContent` | Supported reuse only via `cache.gemini.cached_content` / `cache.google.cached_content` | **Gap**: no schema surface for cache-resource lifecycle (create/list/delete) inputs; only reference by id/name. |

### OpenRouter

| Area | Vendor capability | PromptOpsKit status | Gap |
|---|---|---|---|
| Structured outputs | `response_format` with `json_schema` on compatible models | Supported through OpenAI-compatible adapter path (`response.schema*`) | No major schema gap for common usage. |
| Prompt caching | Provider-dependent + explicit/automatic forms (including Anthropic-style `cache_control`) | Partially supported through existing `cache` fields | **Partial**: OpenRouter-specific knobs/headers are not explicitly modeled as first-class fields. |
| Response-healing / plugins | Optional provider features outside base chat schema | Not modeled in core schema | Out of scope by design (currently). |

## Recommended next schema additions

If we want closer parity with currently published vendor features while preserving portability:

1. **Add optional `response.schema_description`** for OpenAI/OpenRouter structured outputs.
2. **Optionally formalize runtime OpenAI Responses checks** in docs/types (for `conversation` vs `previous_response_id`) as a "runtime schema" contract.
3. **Add Anthropic structured-output support path** (likely in `provider_options.anthropic` first, then portable mapping).
4. **Add Gemini JSON-schema alternative field** (e.g., `provider_options.gemini.response_json_schema`).
5. **Add optional OpenRouter vendor block** under `provider_options.openrouter` for feature flags/headers that are not portable.
6. **Document runtime responsibility for vendor headers** (for capabilities gated by beta/version headers, especially Anthropic caching modes).

## Scope and methodology

- This analysis focuses on **published request-schema capabilities** that affect prompt front matter and adapter request shaping.
- It intentionally excludes pricing, policy, and model-availability differences except where they change request schema behavior.
- Where docs are provider-specific and evolving quickly, treat this page as a dated snapshot and re-verify against vendor docs before implementing changes.
