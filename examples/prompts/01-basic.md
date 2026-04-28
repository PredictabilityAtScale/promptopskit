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

# Notes

This is the smallest useful prompt example:
- Inherits `provider` and `model` from `defaults.md`.
- Declares a single input used in interpolation.
- Uses a single prompt template section.
