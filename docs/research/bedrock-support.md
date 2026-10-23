# AWS Bedrock support in PromptOpsKit

Research date: 2026-10-23. Scope: PromptOpsKit request rendering and its optional UsageTap helpers. The customer wants inference billed to their own AWS account.

## Recommendation

Add a native `bedrock` provider adapter that renders input for the AWS SDK's `ConverseCommand` and `ConverseStreamCommand`. Keep the AWS client, region, credentials, role assumption, transport, retries, and provider billing in the customer's application. This fits PromptOpsKit's existing role as the prompt asset and request rendering layer.

For a customer whose chosen model supports Bedrock's OpenAI-compatible API, the existing `openai` or `openai-responses` renderer is a smaller immediate option. Validate the exact model, endpoint, and parameters first. This is protocol reuse, not comprehensive native Bedrock support.

Neither option requires the customer to adopt the LLMAsAService or UsageTap gateway. UsageTap metering can remain optional and direct. Gateway support is a separate product dependency only if the customer specifically wants gateway routing.

## What the repository supports today

The inspected package is version 0.11.0. Findings below concern the local source, not a verified deployed service or published package.

| Area | Existing behavior | Bedrock implication |
| --- | --- | --- |
| Provider registry | OpenAI Chat, Responses, Anthropic, Gemini, OpenRouter, LLMAsAService, UsageTap | No registered `bedrock` adapter |
| Prompt/defaults schema | Explicit provider enums and provider-specific option blocks | Add Bedrock to both prompt and defaults schemas |
| Request contract | `{ body, provider, model, baseURL?, headers? }` | Can carry AWS SDK command input in `body`; HTTP auth fields need not be present |
| Rendering pipeline | Variables, includes, defaults, overrides, input validation, history compaction, compression | Reuse the existing pipeline |
| Tools | Inline JSON-schema definitions or names resolved from a registry | Translate to Bedrock `toolSpec` objects |
| History | `{ role: string, content: string }[]` | Covers text turns; cannot represent native tool-result or multimodal history |
| Raw passthrough | Per-provider blocks, shallow merged | Add `raw.bedrock`; do not reuse `raw.anthropic` for Converse |
| Cache options | OpenAI, Anthropic, Gemini-specific schemas | Native Bedrock cache checkpoints need their own mapping |
| UsageTap helpers | Generic lifecycle plus several provider extractors | No Bedrock extractor/runner; current end-usage type lacks cache-write and provider fields |

Evidence: [provider registry](../../src/providers/index.ts), [request and history types](../../src/providers/types.ts), [schemas](../../src/schema/schema.ts), [rendering wrapper](../../src/providers/prompt-input.ts), [usage types](../../src/usagetap/types.ts), and [usage helpers](../../src/usagetap/providers.ts).

## Two valid ways to use Bedrock

### 1. Existing renderer plus a Bedrock-compatible endpoint

AWS currently supports OpenAI-compatible Chat Completions and Responses APIs. Its current endpoint guidance starts new applications on `bedrock-runtime`, with `bedrock-mantle` available for capabilities or models that require it. Availability varies by model and API. See [AWS endpoint guidance](https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html) and [API compatibility](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html).

For PromptOpsKit, the application can render using `openai` or `openai-responses`, supply the exact AWS model identifier through the asset or runtime override, and send the rendered body using its own client configured for Bedrock. Credentials and the regional URL belong to that client.

This can require no PromptOpsKit code changes for a simple, compatible request. However:

- `provider: openai` selects a payload format; it does not select an AWS account or configure authentication.
- Existing OpenAI cache fields, reasoning fields, token-limit fields, tools, and raw options are not automatically valid for every Bedrock model.
- The Chat renderer currently emits `max_tokens` from `sampling.max_output_tokens`; check the chosen model's accepted token-limit field.
- Bedrock runtime does not expose OpenAI-compatible `GET /models`. Discovery must use AWS's control-plane APIs or model documentation.

AWS documents the runtime chat base URL as `https://bedrock-runtime.{region}.amazonaws.com/openai/v1`. Mantle path prefixes can differ by model. See [Bedrock Chat Completions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html).

Use this path when the customer already uses the corresponding API format and its required features pass a focused integration check. Document it as compatibility guidance rather than claiming all Bedrock models are interchangeable.

### 2. Native Bedrock Converse rendering

This is the recommended first-class addition for customer-owned AWS SDK integrations. Converse supplies a common interface across supporting models, with model-specific settings carried separately. AWS accepts foundation-model IDs and applicable inference-profile IDs/ARNs. See [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).

Proposed output, not implemented:

```json
{
  "provider": "bedrock",
  "model": "<exact-approved-bedrock-model-or-inference-profile-id>",
  "body": {
    "modelId": "<exact-approved-bedrock-model-or-inference-profile-id>",
    "system": [{ "text": "You are a support assistant." }],
    "messages": [
      { "role": "user", "content": [{ "text": "Help me reset my password." }] }
    ],
    "inferenceConfig": { "maxTokens": 1024 }
  }
}
```

Here `body` means SDK command input, including `modelId`. The AWS SDK moves `modelId` into the HTTP request path. This object is not a JSON body to POST unchanged to the runtime root URL.

The application constructs its own `BedrockRuntimeClient` and chooses `ConverseCommand` or `ConverseStreamCommand`. Both consume the same core prompt input. PromptOpsKit should not serialize a `stream` field into that input. Initially the app can choose its command from its known call mode or `renderResult.resolved.response.stream`; an optional operation discriminator can be considered if direct-adapter callers need it.

## Native adapter mappings

| PromptOpsKit source | Proposed Converse output or policy |
| --- | --- |
| `model` | `modelId`, preserving the exact identifier |
| System instructions | `system: [{ text }]` |
| Text user/assistant history | `messages[].content: [{ text }]` |
| Prompt template | Final user text message |
| `sampling.max_output_tokens` | `inferenceConfig.maxTokens` |
| `sampling.temperature` | `inferenceConfig.temperature` |
| `sampling.top_p` | `inferenceConfig.topP` |
| `sampling.stop` | `inferenceConfig.stopSequences` |
| Inline tool `input_schema` | `toolConfig.tools[].toolSpec.inputSchema.json` |
| Provider-specific tool choice | `toolConfig.toolChoice` |
| `response.schema` | `outputConfig.textFormat`, when supported |
| Native extension settings | `additionalModelRequestFields` |
| Explicit Bedrock cache selection | Native `cachePoint` blocks |
| `response.stream` | Application command selection, not an input-body field |
| Frequency/presence penalties | Warn or reject unless an explicit model-specific mapping is supported |

The request schema is documented in [Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html). Function tools and content blocks should be checked against the selected model's capabilities.

Use `renderSections`, `resolveAssetForProvider`, `compactHistoryForPrompt`, and `withPromptInputSupport`, following existing adapters. Keep `render()` synchronous and offline. Do not add AWS network discovery to prompt validation or compilation.

Set an explicit bounded output limit. Require `sampling.max_output_tokens` for an initial customer pilot, or document a conservative adapter default. Avoid a large unconditional fallback such as 64K. A missing or excessive maximum can reserve unnecessary token quota; see AWS's [quota guidance](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html).

Do not reuse the existing Anthropic body as a Converse input: it has different model, message, tool, and sampling fields. Likewise, validate model-specific sampling ranges instead of silently clamping the generic schema's values.

### History and tools need a clear scope

The current string-only history interface cannot preserve tool IDs, tool results, images, documents, or signed reasoning blocks. Converting those objects to strings would lose protocol information.

For the first release, support text turns and tool declarations, and explicitly document that the application owns the tool loop. Reject unsupported history roles instead of silently dropping or reinterpreting them. System/developer history needs a documented policy because Converse message roles are user/assistant and system content has a separate location.

If the customer needs complete tool conversations or multimodal turns, add a separate native message input or a properly discriminated richer history type. Preserve existing string-history callers. Any new runtime message option must be forwarded through both the kit-level and direct-adapter render paths. Merely rendering tool definitions does not constitute full tool-loop support.

### Structured output is more than renaming a field

For Converse, use `outputConfig.textFormat.type: json_schema` and `structure.jsonSchema`. The nested `schema` value is a JSON string, so stringify the resolved `response.schema`. Map schema name/description too. See [OutputFormat](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_OutputFormat.html) and [JsonSchemaDefinition](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_JsonSchemaDefinition.html).

Continue resolving `schema_ref` through the existing pipeline. Add Bedrock-specific schema diagnostics; AWS supports a constrained JSON Schema subset, and model-specific requirements may add fields. Do not strip constraints silently or substitute a prompt instruction for an enforced schema. See [AWS structured output guidance](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html).

Define behavior for `response.format: json` without a schema separately. Do not imply that it supplies the same guarantee as a supported structured-output schema. Treat `schema_strict` as a model-specific capability rather than inventing one universal Converse strictness flag.

AWS documentation currently contains conflicting general versus endpoint-specific statements about structured output on Mantle Messages. For the initial native adapter, target tested Converse behavior and verify the exact model card rather than asserting universal support.

### Reasoning and caching need provider-specific settings

Do not translate every `reasoning.effort` into one universal Bedrock token budget. Model families expose different controls. Use explicit Bedrock extension fields initially and add tested mappings for the customer's chosen family. Warn when a normalized request cannot be honored.

Introduce `cache.bedrock` only with a defined checkpoint policy: which of system, tools, and template content is marked, and which model/TTL is supported. Avoid marking a changing final user prompt by default. Anthropic `cache_control` and OpenAI retention options cannot simply be copied into Converse. See [Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html).

## Concrete repository changes

| File or area | Required work |
| --- | --- |
| `src/providers/bedrock.ts` | New pure adapter, validation, prompt-input wrapper |
| `src/providers/index.ts`, `src/index.ts` | Register and export adapter and any public types |
| `src/schema/schema.ts`, `src/schema/index.ts` | Provider enums, Bedrock options, raw block, optional cache schema, exports |
| `src/providers/raw.ts` | Accept Bedrock passthrough |
| `src/parser/loader.ts` | Merge Bedrock option/raw/cache blocks through folder defaults |
| `src/overrides/apply-overrides.ts` | Merge corresponding environment/tier/runtime blocks |
| `src/providers/types.ts`, `src/index.ts` | Only extend runtime types/forwarding if native messages or operation metadata are added |
| `src/validation/validate.ts` | Bedrock diagnostics for unsupported schema/settings |
| `tsup.config.ts`, `package.json` | Build and expose `promptopskit/bedrock` for ESM/CJS/types |
| `tests/providers.test.ts`, new Bedrock tests | Mapping, errors, pipeline parity, typed SDK compatibility |
| Defaults/overrides/parser/CLI tests | Protect inheritance and compiled assets |
| `README.md`, `docs/providers.md`, `docs/schema.md`, `docs/api-reference.md`, `SKILL.md` | Document native support, supported scope, SDK examples, compatibility route |

The explicit provider-block merge lists in the loader and overrides are easy to miss. Adding only the schema and adapter can leave inheritance behaving differently from other providers. The CLI `render --json` currently outputs a prompt preview, not the provider's SDK payload; do not describe it as a Bedrock wire-request validator.

Avoid an AWS SDK runtime dependency in the core package. Consumers already making Bedrock calls own that dependency. Use the SDK as a development/type-verification dependency if useful, and expose a typed native input from the Bedrock subpath for ergonomic SDK handoff.

`raw.bedrock` should represent SDK input overrides, with documented shallow merging. Validate that overriding `modelId` cannot leave `request.model` reporting a different model. The same concern applies when entitlement logic changes a model.

## Optional UsageTap support inside this package

This is a second deliverable, not a prerequisite to rendering Bedrock prompts.

Add `extractBedrockUsage` and optionally `runBedrockWithUsageTap`. Keep the `invoke` callback customer-owned, consistent with existing helpers. Extend `UsageTapEndUsage` with `providerUsed`, cache-write totals, and supported TTL detail. The newer standalone UsageTap SDK already has these fields, but this package's local helper types do not.

For Converse usage, the canonical total input is:

```text
inputTokens = usage.inputTokens
            + usage.cacheReadInputTokens
            + usage.cacheWriteInputTokens
cachedInputTokens = usage.cacheReadInputTokens
cacheWriteInputTokens = usage.cacheWriteInputTokens
responseTokens = usage.outputTokens
```

AWS explicitly documents that Converse's `inputTokens` excludes cache reads/writes when caching is enabled. Example: 28 uncached + 1,898 cached = 1,926 total input. Do not apply this additive rule blindly to OpenAI-compatible usage, whose counters have different semantics. See [AWS caching metrics](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html).

For streaming, usage arrives in the final metadata event. A helper that ends when the SDK returns a stream object will finalize too early. Initially document manual lifecycle management; add a stream-aware helper only with completion, exception, cancellation, and abort behavior defined. Preserve unavailable usage as unknown rather than silently treating it as measured zero.

The existing local lifecycle invokes its callback after `call_begin` without automatically stopping on denied allowances. A Bedrock integration must inspect the decision before invoking AWS, and must not finalize an already-finalized denial. Also avoid using an already-aborted provider signal for the final usage submission. These are existing helper limitations to resolve or explicitly handle, not capabilities supplied by a new adapter. See [local lifecycle](../../src/usagetap/lifecycle.ts) and [UsageTap lifecycle contract](https://usagetap.com/llmreference).

`applyModelTier` currently updates `body.model`, not `body.modelId`. Bedrock entitlements must update both the request metadata and actual `modelId`. Tool gating must inspect `toolConfig.tools[].toolSpec`, and reasoning limits must respect the selected family's settings. Do not reuse the OpenAI mutation branch unchanged.

Metering records usage; it does not guarantee AWS invoice cost. The inspected UsageTap service currently prices through an OpenRouter catalog and labels other provider calculations as estimated. Accurate AWS-specific rates/reconciliation belong to UsageTap service work, outside this PromptOpsKit addition.

## Customer-owned AWS boundary

The recommended flow is:

```text
Prompt Markdown -> PromptOpsKit renderer -> AWS SDK command input
                                       -> customer's AWS client -> Bedrock
                                       -> optional UsageTap usage metadata
```

The app's execution role, credential provider, or separately configured assumed role determines the AWS account used. PromptOpsKit does not need to store access keys, create IAM roles, assume a cross-account role, discover quotas, or proxy prompts. A model ID alone does not confer AWS access.

The customer must select an exact supported model/profile and region, arrange model access, and grant the relevant inference permissions. Converse uses `bedrock:InvokeModel`; streaming uses `bedrock:InvokeModelWithResponseStream`. See [inference prerequisites](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-prereq.html). Anthropic first use may also require its usage form; see [AWS model access](https://aws.amazon.com/blogs/security/simplified-amazon-bedrock-model-access/).

Use the customer's approved model/profile ID unchanged. A regional endpoint does not imply single-region processing when a cross-region profile is used. See [inference-profile routing](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html).

For a requirement that prompt content stay within the customer's approved boundary, also inspect opt-in compression. TheTokenCompany compression makes a separate external request during async rendering. Local heuristic/code compression and a customer-supplied history compactor have different data paths. Keep external compression disabled unless approved; native Bedrock rendering does not require it.

## Delivery plan and acceptance

Engineering estimates below are planning judgment for one engineer familiar with this repository, not measured commitments. Customer access and security review can add elapsed time.

| Slice | Estimated effort | Outcome |
| --- | --- | --- |
| Compatible OpenAI-format pilot | 0.5-1 day | Validate an existing renderer against the customer's exact Bedrock API/model |
| Native text adapter | 2-4 days | Schema, registry, defaults/overrides, SDK input, package export, tests, docs |
| Cache/tools/structured output for selected models | 2-4 additional days | Explicitly tested feature subset with useful diagnostics |
| Optional UsageTap buffered usage support | 1-2 additional days | Correct extraction and lifecycle/entitlement handling |
| Rich tool history, multimodal, stream-aware metering | Separate follow-up | Estimate after the customer's actual turn/stream contract is known |

A useful first-class release is roughly one to two working weeks for a bounded text/function-tool/schema/cache subset. Rendering alone is smaller. Do not promise full Bedrock coverage from these estimates.

Acceptance checks:

1. Identical prompt composition and overrides work through kit rendering, direct adapters, and compiled assets.
2. SDK inputs have correct `modelId`, system/messages, sampling, and tools, without an HTTP-only `model` or `stream` field.
3. Unsupported roles, unresolved tools, unsupported schema constraints, and incompatible settings produce clear diagnostics.
4. Defaults and override tests prove new Bedrock blocks merge consistently; raw identity cannot drift from reported identity.
5. The documented body type is assignable to both intended AWS SDK command inputs; ESM/CJS exports and generated declarations work.
6. Optional usage tests cover no-cache, cache write, cache hit, errors, denial, model downgrade, and delayed stream metadata. No double-counted inputs or early finalization.
7. Run `npm run lint`, `npm test`, `npm run build`, and the existing package type/export check after implementation.
8. With customer-authorized AWS access, run a small buffered and streamed smoke test using their selected model/region and verify AWS account ownership. These live checks were not performed for this research.

Before choosing the compatibility shortcut versus the native adapter, obtain the customer's model/profile ID, API/SDK preference, and whether they require tool loops, schemas, caching, streaming, or multimodal input. Those choices determine the useful initial scope; AWS account ownership does not require a gateway change in PromptOpsKit.
