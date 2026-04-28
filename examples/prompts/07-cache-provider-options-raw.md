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

# Notes

Demonstrates advanced provider control:
- Provider-specific caching hints.
- Provider-specific options (`top_k`).
- `raw` passthrough for unmodeled request body fields.
