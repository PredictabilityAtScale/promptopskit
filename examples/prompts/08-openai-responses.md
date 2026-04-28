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

# Notes

Demonstrates the `openai-responses` provider and its request body shape.
