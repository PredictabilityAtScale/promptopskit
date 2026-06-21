# PromptOpsKit Example Library

This folder contains a small, validation-safe set of prompt examples that demonstrate the main PromptOpsKit features and front matter schema.

GitHub Markdown does not support native tabbed panels, so this README uses compact per-example sections. Each example shows sample inputs, the generated provider request body, and the practical result the example is meant to teach.

## Layout

- `prompts/defaults.md`: folder defaults for provider, model, options, metadata, cache, and system instructions
- `prompts/shared/`: reusable includes used by composition examples
- `prompts/*.md`: standalone examples with a `# Notes` section

## Validate All Examples

```bash
npm run build
node dist/cli/index.js validate examples/prompts
```

## Inspect Or Render A Single Example

```bash
node dist/cli/index.js inspect examples/prompts/03-composition-includes.md
node dist/cli/index.js render examples/prompts/05-response-schema-json.md --json
```

For full provider request bodies, use the library API:

```ts
import { createPromptOpsKit } from 'promptopskit';

const kit = createPromptOpsKit({ sourceDir: 'examples/prompts' });
const result = await kit.renderPrompt({
  path: '01-basic',
  provider: 'openai',
  variables: { name: 'Avery' },
});

console.log(result.request?.body);
```

## Shared Defaults

All examples under `examples/prompts` inherit `prompts/defaults.md` unless they override a field.

Generated defaults for most OpenAI examples:

```json
{
  "provider": "openai",
  "model": "gpt-5.4-mini",
  "metadata": {
    "owner": "examples-team",
    "stable": true
  },
  "cache": {
    "openai": {
      "prompt_cache_key": "examples-v1",
      "retention": "in_memory"
    }
  },
  "system_instructions": "You are a clear, practical assistant. Prefer concise, actionable responses."
}
```

Result: simple examples stay small because common model, cache, metadata, and baseline system behavior live in one folder default.

## 01 - Basic Variable Interpolation

File: `prompts/01-basic.md`

Shows the smallest useful prompt: one declared input and one prompt template.

Prompt:

```text
---
id: examples/basic
schema_version: 1
description: Minimal prompt with variable interpolation.
context:
  inputs:
    - name: name
      non_empty: true
      reject_secrets: true
---

# Prompt template

Hello {{ name }}! Give a one-sentence welcome.
```

Inputs:

```json
{
  "name": "Avery"
}
```

Generated OpenAI body:

```json
{
  "model": "gpt-5.4-mini",
  "messages": [
    {
      "role": "system",
      "content": "You are a clear, practical assistant. Prefer concise, actionable responses."
    },
    {
      "role": "user",
      "content": "Hello Avery! Give a one-sentence welcome."
    }
  ],
  "prompt_cache_key": "examples-v1",
  "prompt_cache_retention": "in_memory"
}
```

Result: `{{ name }}` is interpolated into the user message, while provider, model, cache, and system instructions come from `defaults.md`.

## 02 - Context Validation

File: `prompts/02-context-validation.md`

Shows input hardening with size limits, regex guards, secret rejection, trimming, and user-facing return messages.

Prompt:

```text
---
id: examples/context-validation
schema_version: 1
context:
  history:
    max_items: 10
  inputs:
    - name: user_message
      max_size: 2000
      non_empty:
        return_message: "Please enter your question."
      reject_secrets:
        return_message: "Please remove credentials before sending your message."
      deny_regex:
        pattern: '(?:ignore|forget)\s+all\s+instructions'
        flags: i
        return_message: "Please avoid prompt-injection text."
    - name: app_context
      max_size: 400
      trim: end
      allow_regex: '/^[A-Za-z0-9 .,_-]+$/'
---

# System instructions

Use `app_context` only when relevant to the request.

# Prompt template

Context: {{ app_context }}

User message: {{ user_message }}
```

Inputs:

```json
{
  "app_context": "Billing portal checkout",
  "user_message": "Why was my invoice higher this month?"
}
```

Generated OpenAI body:

```json
{
  "model": "gpt-5.4-mini",
  "messages": [
    {
      "role": "system",
      "content": "Use `app_context` only when relevant to the request."
    },
    {
      "role": "user",
      "content": "Context: Billing portal checkout\n\nUser message: Why was my invoice higher this month?"
    }
  ],
  "prompt_cache_key": "examples-v1",
  "prompt_cache_retention": "in_memory"
}
```

Result: safe input renders normally. Empty messages, secrets, oversized values, disallowed characters, or text matching `(?:ignore|forget)\s+all\s+instructions` are blocked or transformed according to the context rules. If runtime history has more than 10 messages, earlier turns are compacted into one preserved history item before rendering.

History compaction example:

```ts
const result = await kit.renderPrompt({
  path: '02-context-validation',
  provider: 'openai',
  variables: {
    app_context: 'Billing portal checkout',
    user_message: 'Why was my invoice higher this month?',
  },
  history: [
    { role: 'user', content: 'I changed my plan last week.' },
    { role: 'assistant', content: 'I can help review the billing impact.' },
    // ...more than 10 total messages
  ],
  onHistoryCompaction: ({ overflow }) => ({
    role: 'user',
    content: `Earlier conversation summary: ${summarizeConversationUsingLLM(overflow)}`,
  }),
});
```

Generated OpenAI history shape when more than 10 history messages are supplied:

```json
[
  {
    "role": "user",
    "content": "Earlier conversation summary: ..."
  },
  {
    "role": "assistant",
    "content": "recent preserved turn"
  },
  {
    "role": "user",
    "content": "Context: Billing portal checkout\n\nUser message: Why was my invoice higher this month?"
  }
]
```

## 03 - Composition With Includes

File: `prompts/03-composition-includes.md`

Shows reusable prompt fragments with `includes`.

Prompt:

```text
---
id: examples/composition
schema_version: 1
includes:
  - ./shared/tone.md
  - ./shared/safety.md
context:
  inputs:
    - name: topic
      non_empty: true
      reject_secrets: true
---

# System instructions

Prioritize practical examples over abstract theory.

# Prompt template

Teach the basics of {{ topic }} in 5 bullet points.
```

Inputs:

```json
{
  "topic": "rate limiting"
}
```

Generated OpenAI body:

```json
{
  "model": "gpt-5.4-mini",
  "messages": [
    {
      "role": "system",
      "content": "Use plain language, short paragraphs, and a supportive tone.\n\nDo not invent policies or capabilities. If uncertain, state uncertainty clearly.\n\nPrioritize practical examples over abstract theory."
    },
    {
      "role": "user",
      "content": "Teach the basics of rate limiting in 5 bullet points."
    }
  ],
  "prompt_cache_key": "examples-v1",
  "prompt_cache_retention": "in_memory"
}
```

Result: system instructions from `shared/tone.md` and `shared/safety.md` are prepended before the local system instruction, producing one composed system message.

## 04 - Environment And Tier Overrides

File: `prompts/04-overrides-env-tier.md`

Shows override layering: base config, then environment, then tier, then runtime overrides.

Prompt:

```text
---
id: examples/overrides
schema_version: 1
model: gpt-5.4
reasoning:
  effort: medium
sampling:
  temperature: 0.4
environments:
  dev:
    model: gpt-5.4-mini
    reasoning:
      effort: low
    sampling:
      temperature: 0.8
    cache:
      openai:
        prompt_cache_key: examples-overrides-dev
        retention: in_memory
tiers:
  fast:
    model: gpt-5.4-mini
    sampling:
      temperature: 0.2
    cache:
      openai:
        prompt_cache_key: examples-overrides-fast
        retention: in_memory
context:
  inputs:
    - name: user_goal
      non_empty: true
      reject_secrets: true
---

# Prompt template

Generate a short implementation plan for: {{ user_goal }}.
```

Inputs:

```json
{
  "user_goal": "Add retries around flaky API calls"
}
```

Render options:

```json
{
  "environment": "dev",
  "tier": "fast"
}
```

Generated OpenAI body:

```json
{
  "model": "gpt-5.4-mini",
  "messages": [
    {
      "role": "system",
      "content": "You are a clear, practical assistant. Prefer concise, actionable responses."
    },
    {
      "role": "user",
      "content": "Generate a short implementation plan for: Add retries around flaky API calls."
    }
  ],
  "temperature": 0.2,
  "reasoning_effort": "low",
  "prompt_cache_key": "examples-overrides-fast",
  "prompt_cache_retention": "in_memory"
}
```

Result: the `dev` environment lowers the reasoning effort, and the `fast` tier wins for temperature and cache key. The final body is optimized for a cheaper, faster planning pass.

## 05 - JSON Response Schema

File: `prompts/05-response-schema-json.md`

Shows portable structured output settings through the `response` block.

Prompt:

```text
---
id: examples/response-json
schema_version: 1
response:
  format: json
  schema_name: quick_answer
  schema_description: Structured answer with confidence and citations.
  schema_strict: true
  schema:
    type: object
    additionalProperties: false
    required:
      - answer
      - confidence
      - citations
    properties:
      answer:
        type: string
      confidence:
        type: number
        minimum: 0
        maximum: 1
      citations:
        type: array
        items:
          type: string
context:
  inputs:
    - name: question
      non_empty: true
      reject_secrets: true
---

# Prompt template

Answer this question as structured JSON: {{ question }}
```

Inputs:

```json
{
  "question": "What is a circuit breaker in distributed systems?"
}
```

Generated OpenAI body:

```json
{
  "model": "gpt-5.4-mini",
  "messages": [
    {
      "role": "system",
      "content": "You are a clear, practical assistant. Prefer concise, actionable responses."
    },
    {
      "role": "user",
      "content": "Answer this question as structured JSON: What is a circuit breaker in distributed systems?"
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "quick_answer",
      "description": "Structured answer with confidence and citations.",
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "answer",
          "confidence",
          "citations"
        ],
        "properties": {
          "answer": {
            "type": "string"
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "citations": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      },
      "strict": true
    }
  },
  "prompt_cache_key": "examples-v1",
  "prompt_cache_retention": "in_memory"
}
```

Result: the provider request asks for strict JSON schema output with `answer`, `confidence`, and `citations` fields.

Expected response shape:

```json
{
  "answer": "A circuit breaker stops calls to a failing dependency after repeated errors, then periodically probes it before allowing normal traffic again.",
  "confidence": 0.9,
  "citations": []
}
```

## 06 - Tools And MCP References

File: `prompts/06-tools-and-mcp.md`

Shows the two tool declaration styles and MCP server references.

Prompt:

```text
---
id: examples/tools-mcp
schema_version: 1
tools:
  - web_search
  - name: lookup_order
    description: Fetch an order by id.
    input_schema:
      type: object
      required:
        - order_id
      properties:
        order_id:
          type: string
mcp:
  servers:
    - docs-index
    - name: billing-db
      config:
        readonly: true
context:
  inputs:
    - name: order_id
      non_empty: true
      allow_regex: /^[A-Z0-9-]+$/
---

# Prompt template

Find the order status for {{ order_id }}.
```

Inputs:

```json
{
  "order_id": "ORD-12345"
}
```

Generated OpenAI body:

```json
{
  "model": "gpt-5.4-mini",
  "messages": [
    {
      "role": "system",
      "content": "You are a clear, practical assistant. Prefer concise, actionable responses."
    },
    {
      "role": "user",
      "content": "Find the order status for ORD-12345."
    }
  ],
  "prompt_cache_key": "examples-v1",
  "prompt_cache_retention": "in_memory",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "web_search"
      }
    },
    {
      "type": "function",
      "function": {
        "name": "lookup_order",
        "description": "Fetch an order by id.",
        "parameters": {
          "type": "object",
          "required": [
            "order_id"
          ],
          "properties": {
            "order_id": {
              "type": "string"
            }
          }
        }
      }
    }
  ]
}
```

Result: `web_search` becomes a named function placeholder unless supplied by a runtime tool registry, while `lookup_order` renders as a full function definition. The `mcp.servers` entries remain prompt metadata for host applications to wire into their MCP runtime.

## 07 - Provider Controls, Cache, And Raw Passthrough

File: `prompts/07-cache-provider-options-raw.md`

Shows provider-native controls for Anthropic: explicit prompt caching, `top_k`, and `raw` request body passthrough.

Prompt:

```text
---
id: examples/provider-controls
schema_version: 1
provider: anthropic
model: claude-sonnet-4-20250514
cache:
  anthropic:
    mode: explicit
    type: ephemeral
    ttl: 5m
    cache_system_instructions: true
provider_options:
  anthropic:
    top_k: 40
raw:
  anthropic:
    metadata:
      trace_id: example-provider-controls
context:
  inputs:
    - name: support_ticket
      non_empty: true
      reject_secrets: true
      max_size: 6000
---

# System instructions

Summarize support issues without exposing personal data.

# Prompt template

Support ticket:
{{ support_ticket }}
```

Inputs:

```json
{
  "support_ticket": "Customer cannot access account after SSO migration."
}
```

Generated Anthropic body:

```json
{
  "model": "claude-sonnet-4-20250514",
  "messages": [
    {
      "role": "user",
      "content": "Support ticket:\nCustomer cannot access account after SSO migration."
    }
  ],
  "system": [
    {
      "type": "text",
      "text": "Summarize support issues without exposing personal data.",
      "cache_control": {
        "type": "ephemeral",
        "ttl": "5m"
      }
    }
  ],
  "max_tokens": 4096,
  "top_k": 40,
  "metadata": {
    "trace_id": "example-provider-controls"
  }
}
```

Result: the system instruction receives Anthropic cache control, `provider_options.anthropic.top_k` becomes `top_k`, and `raw.anthropic.metadata` is merged into the final request body.

## 08 - OpenAI Responses API

File: `prompts/08-openai-responses.md`

Shows the `openai-responses` provider, which renders for the OpenAI Responses API instead of Chat Completions.

Prompt:

```text
---
id: examples/openai-responses
schema_version: 1
provider: openai-responses
model: gpt-5.4-mini
sampling:
  temperature: 0.3
context:
  inputs:
    - name: changelog
      non_empty: true
      max_size: 6000
---

# System instructions

Write release notes in a clear customer-facing style.

# Prompt template

Turn this changelog into release notes:
{{ changelog }}
```

Inputs:

```json
{
  "changelog": "Added SSO. Fixed invoice export timeout. Improved mobile navigation."
}
```

Generated OpenAI Responses body:

```json
{
  "model": "gpt-5.4-mini",
  "input": [
    {
      "role": "user",
      "content": "Turn this changelog into release notes:\nAdded SSO. Fixed invoice export timeout. Improved mobile navigation."
    }
  ],
  "instructions": "Write release notes in a clear customer-facing style.",
  "temperature": 0.3
}
```

Result: system instructions map to `instructions`, the user prompt maps to `input`, and the sampling temperature maps directly onto the Responses API body.

## 09 - TheTokenCompany Compression Before Cache

File: `prompts/09-compression-cache.md`

Shows prompt-template compression before provider request generation and OpenAI cache fields.

Prompt:

```text
---
id: examples/compression-cache
schema_version: 1
description: Compress a long stable prompt template before provider cache controls are applied.
compression:
  thetokencompany:
    enabled: true
    model: bear-2
    aggressiveness: 0.2
cache:
  openai:
    prompt_cache_key: examples-compression-v1
    retention: 24h
context:
  inputs:
    - name: product_brief
      non_empty: true
      reject_secrets: true
      max_size: 10000
    - name: customer_segment
      non_empty: true
      max_size: 120
      allow_regex: /^[A-Za-z0-9 .,_-]+$/
---

# System instructions

Write concise product positioning without inventing capabilities.

# Prompt template

Create a launch-note draft for this customer segment:
{{ customer_segment }}

Product brief:
{{ product_brief }}
```

Inputs:

```json
{
  "customer_segment": "Enterprise admins",
  "product_brief": "New audit log filters, export scheduling, and role-based report access."
}
```

Render code:

```ts
const result = await kit.renderPrompt({
  path: '09-compression-cache',
  provider: 'openai',
  variables: {
    customer_segment: 'Enterprise admins',
    product_brief: 'New audit log filters, export scheduling, and role-based report access.',
  },
  theTokenCompany: {
    apiKey: process.env.THETOKENCOMPANY_API_KEY,
  },
});
```

Generated OpenAI body shape after compression:

```json
{
  "model": "gpt-5.4-mini",
  "messages": [
    {
      "role": "system",
      "content": "Write concise product positioning without inventing capabilities."
    },
    {
      "role": "user",
      "content": "<compressed prompt returned by TheTokenCompany>"
    }
  ],
  "prompt_cache_key": "examples-compression-v1",
  "prompt_cache_retention": "24h"
}
```

Result: PromptOpsKit sends the rendered prompt template to TheTokenCompany first, then places the compressed output into the provider request. OpenAI cache hints are applied to that compressed request body.
