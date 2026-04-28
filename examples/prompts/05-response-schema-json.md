---
id: examples/response-json
schema_version: 1
response:
  format: json
  schema_name: quick_answer
  schema_description: Structured answer with confidence and citations.
  schema_strict: true
  schema:
    type: object
    additionalProperties: false
    required:
      - answer
      - confidence
      - citations
    properties:
      answer:
        type: string
      confidence:
        type: number
        minimum: 0
        maximum: 1
      citations:
        type: array
        items:
          type: string
context:
  inputs:
    - name: question
      non_empty: true
      reject_secrets: true
---

# Prompt template

Answer this question as structured JSON: {{ question }}

# Notes

Shows portable structured output settings via `response`.
