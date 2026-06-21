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

# Notes

Demonstrates prompt-template compression before provider request generation:
- `compression.thetokencompany` compresses the rendered prompt template.
- `cache.openai` is then applied to the provider request that contains the compressed user message.
- Applications must pass `theTokenCompany.apiKey` or set `THETOKENCOMPANY_API_KEY` at render time.
