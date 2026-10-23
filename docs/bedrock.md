# AWS Bedrock

Use `provider: bedrock` to render native input for `ConverseCommand` or `ConverseStreamCommand`. Your application owns the AWS client, credentials, region, retries, transport, and billing account. Rendering, validation, and compilation do not contact AWS or require AWS credentials.

## Prompt asset

```markdown
---
id: support/reply
schema_version: 1
provider: bedrock
model: us.anthropic.claude-sonnet-4-6
sampling:
  max_output_tokens: 1024
context:
  inputs:
    - name: user_message
      non_empty: true
      reject_secrets: true
---

# System instructions

Answer support questions clearly.

# Prompt template

{{ user_message }}
```

The model is an example. Choose an exact model or inference-profile ID/ARN available and approved in your account and region. The adapter preserves the identifier instead of guessing a model or cross-region prefix. AWS managed Prompt Management ARNs are unsupported because PromptOpsKit renders the prompt content.

## Application-owned invocation

Install the SDK in the app that makes the call:

```bash
npm install promptopskit @aws-sdk/client-bedrock-runtime
```

```typescript
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrockAdapter } from 'promptopskit/bedrock';

// AWS region and the SDK credential provider chain belong to the application.
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const request = await bedrockAdapter.renderPrompt(
  { path: 'support/reply' },
  { variables: { user_message: 'How do I reset my password?' }, strict: true },
);
if (!request.body) throw new Error(request.returnMessage);

const response = await client.send(new ConverseCommand(request.body));
const text = response.output?.message?.content
  ?.flatMap((block) => block.text === undefined ? [] : [block.text])
  .join('');
```

`request.body` is typed as `BedrockConverseInput` and is structurally compatible with both AWS commands. PromptOpsKit has no AWS SDK runtime dependency or AWS imports in its public declarations. The SDK is a development-only dependency for compatibility tests.

The input includes `modelId`, which the SDK moves to the HTTP request path. Do not POST this object unchanged to the Bedrock runtime root. The result also contains `provider: bedrock`, `model` matching `body.modelId`, and an `operation` label. No authentication headers or base URL are emitted.

`kit.renderPrompt({ path, provider: 'bedrock', variables })` also works and retains the shared `ProviderRequest` body type. Prefer the direct adapter for typed SDK handoff. Both paths support includes, defaults, environment/tier/runtime overrides, input validation, history compaction, and compiled assets. Override model selection with `runtime: { model: exactModelId }`.

## Streaming

Set `response.stream: true` and invoke with `ConverseStreamCommand`. The operation label changes to `converse-stream`; no `stream` property is serialized in the input.

```typescript
import { ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const request = await bedrockAdapter.renderPrompt(
  { path: 'support/reply' },
  {
    variables: { user_message: 'Explain password recovery.' },
    runtime: { response: { stream: true } },
  },
);
if (!request.body) throw new Error(request.returnMessage);
const response = await client.send(new ConverseStreamCommand(request.body));
for await (const event of response.stream ?? []) {
  const text = event.contentBlockDelta?.delta?.text;
  if (text) process.stdout.write(text);
  // Final usage, when present, is in event.metadata?.usage.
}
```

Check the model's streaming support. The app owns stream consumption, cancellation, errors, and tool execution. Bedrock UsageTap metering helpers are not included in this release.

## Field mappings

| PromptOpsKit field | Native input |
| --- | --- |
| `model` | `modelId` |
| System instructions | `system: [{ text }]` |
| User/assistant text history | `messages[].content: [{ text }]` |
| Prompt template | Final user message |
| `sampling.max_output_tokens` | `inferenceConfig.maxTokens`, default `4096` |
| `sampling.temperature` | `inferenceConfig.temperature`, range 0–1 |
| `sampling.top_p` | `inferenceConfig.topP` |
| `sampling.stop` | `inferenceConfig.stopSequences` |
| `response.schema` | `outputConfig.textFormat.structure.jsonSchema`, with the schema serialized as a JSON string |
| `response.stream` | `request.operation`, outside the SDK input |

Set an output limit suited to the model and workload. Model-specific limits and accepted combinations still apply. Frequency/presence penalties and normalized `reasoning` produce warnings and are not mapped. Use explicit model-specific extension fields below instead of approximate reasoning conversions.

History accepts exactly `role` and `content`, with non-empty user/assistant text. Extra native fields such as `tool_calls` are rejected, including in custom compaction results, so tool protocols are not silently discarded. Put system instructions in the system section. System/developer/tool history roles, tool-result turns, images, documents, and reasoning blocks are unsupported. For richer conversations, the application must explicitly assemble its native message history after rendering; it owns that extension and the tool loop.

## Tools and structured output

```yaml
tools:
  - name: lookup_ticket
    description: Look up a support ticket
    input_schema:
      type: object
      properties:
        ticket_id: { type: string }
      required: [ticket_id]
      additionalProperties: false
provider_options:
  bedrock:
    tool_choice:
      tool: { name: lookup_ticket }
```

Inline tools become `toolConfig.tools[].toolSpec` with `inputSchema.json`. The root schema must declare `type: object`. Named references require `toolRegistry` at render time. Registry definitions may use this neutral format or native `{ toolSpec: { name, inputSchema: { json }, strict? } }` objects. Native strict tool enforcement is model-dependent.

Tool choice accepts exactly one of `{ auto: {} }`, `{ any: {} }`, or `{ tool: { name } }`. Names must be unique and valid for Bedrock, and a forced tool must exist. Declarations do not execute tools.

For enforced structured output, supply `response.schema` or `response.schema_ref`, plus optional `schema_name` and `schema_description`. The adapter serializes the resolved schema for Converse and preserves its constraints. Known provider-sensitive keywords produce warnings (`POK058` in asset/CLI validation).

`response.format: json` without a schema does not enforce JSON and produces a warning. `schema_strict` has no universal Converse mapping and produces a warning; model-specific strictness settings belong in `additional_model_request_fields`. A successful render does not prove that AWS accepts the selected model's schema subset or settings.

## Bedrock-specific options

```yaml
provider_options:
  bedrock:
    additional_model_request_fields: {top_k: 20}
    additional_model_response_field_paths: [/stop_sequence]
    request_metadata: {feature: support_reply}
    guardrail_config:
      guardrailIdentifier: your-guardrail-id
      guardrailVersion: '1'
      trace: disabled
    performance_config: {latency: standard}
    service_tier: {type: default}
```

These map to `additionalModelRequestFields`, `additionalModelResponseFieldPaths`, `requestMetadata`, `guardrailConfig`, `performanceConfig`, and `serviceTier`. The example's `top_k` requires a model that accepts it. The guardrail object uses native camelCase keys. Supported tier values are `default`, `priority`, `flex`, and `reserved`; actual availability remains model/account dependent.

Credentials, authentication role ARNs, region, and client settings belong in application code, not prompt assets. A model's inference-profile ARN is different from an authentication role ARN.

## Explicit cache checkpoints

```yaml
cache:
  bedrock:
    ttl: 5m
    cache_system_instructions: true
    cache_tools: true
    cache_prompt_template: false
```

Each selected location receives `{ cachePoint: { type: 'default', ttl? } }` after its content. All location flags default to false. A TTL alone creates no checkpoints; omitting it leaves the service/model's default. `5m` and `1h` are accepted subject to model support and minimum token requirements. Checkpoints do not guarantee cache hits. Mark a changing final user prompt only when intentional.

Other providers' cache settings are not translated. Compression runs before checkpoint placement. External TheTokenCompany compression still sends content to that service; disable it if content must remain within your AWS boundary.

## Raw input, inheritance, and validation

`raw.bedrock` shallow-merges into SDK input after normalized fields and provider options. Nested objects are replaced, so overriding `inferenceConfig` must include a positive `maxTokens`. Known fields, text messages, and tools are validated after merging. Unknown native extension fields remain an escape hatch and require checking against AWS documentation.

`raw.bedrock.modelId` cannot disagree with the resolved model; change `model` through normal overrides. HTTP-only `model`/`stream` and transport/authentication fields are rejected. Streaming-specific `raw.bedrock.guardrailConfig.streamProcessingMode` requires `response.stream: true`.

Bedrock cache/raw/option blocks shallow-merge through folder defaults and environment/tier/runtime overrides. Compiled JSON/ESM assets preserve them. CLI `render --json` remains a prompt preview, not an AWS wire-request validator. Validation is offline and does not discover account access or model capabilities.

## AWS references

The application's AWS identity determines the inference account. Configure access and least-privilege permissions there. Cross-region profiles may process outside the endpoint's region.

- [Converse input and model identifiers](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
- [ConverseStream](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html)
- [Inference permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-prereq.html)
- [Prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)
- [Structured output limitations](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)

Models supporting Bedrock's OpenAI-compatible APIs can also use compatible payloads from the existing `openai`/`openai-responses` renderers with application-owned client configuration. This native adapter targets Converse, not OpenAI HTTP endpoints or provider-specific InvokeModel bodies.
