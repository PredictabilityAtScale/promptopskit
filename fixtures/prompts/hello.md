---
id: hello
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - name
---

# System instructions

You are a friendly assistant.

# Prompt template

Say hello to {{ name }}.
