---
id: support/reply
schema_version: 1
provider: openai
model: gpt-5.4
fallback_models:
  - gpt-5.4-mini
reasoning:
  effort: medium
sampling:
  temperature: 0.7
  max_output_tokens: 2048
response:
  format: text
context:
  inputs:
    - user_message
    - account_summary
    - app_context
  history:
    max_items: 8
tools:
  - get_account_status
includes:
  - ../shared/tone.md
environments:
  dev:
    model: gpt-5.4-mini
    reasoning:
      effort: low
  prod:
    model: gpt-5.4
tiers:
  free:
    model: gpt-5.4-mini
  pro:
    model: gpt-5.4
metadata:
  owner: support-platform
  review_required: true
---

# System instructions

You are a careful support assistant. Follow refund policy exactly.
Current app context: {{ app_context }}.

# Prompt template

Customer message:
{{ user_message }}

Account summary:
{{ account_summary }}
