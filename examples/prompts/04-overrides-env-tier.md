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

# Notes

Shows override layering:
- Base config is production-like.
- `environments.dev` lowers cost and reasoning effort.
- `tiers.fast` demonstrates runtime performance tuning.
- Runtime options still apply last (base → env → tier → runtime).
