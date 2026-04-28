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

# Notes

Shows composition with `includes`:
- Included system instructions are prepended.
- Local system instructions can add task-specific guidance.
- Shared files remain reusable across many prompts.
