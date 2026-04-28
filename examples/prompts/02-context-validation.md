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

# Notes

Demonstrates context hardening and guards:
- `non_empty` + `reject_secrets` built-ins.
- Structured `deny_regex` with a return message.
- `max_size` and `trim` for large values.
- `history.max_items` for bounded conversation context.
