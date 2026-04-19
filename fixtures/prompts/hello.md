---
id: hello
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - name
    - app_context
---

# System instructions

You are a friendly assistant helping in {{ app_context }}.

# Prompt template

Say hello to {{ name }}.
