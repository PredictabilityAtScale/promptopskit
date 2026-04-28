---
id: examples/tools-mcp
schema_version: 1
tools:
  - web_search
  - name: lookup_order
    description: Fetch an order by id.
    input_schema:
      type: object
      required:
        - order_id
      properties:
        order_id:
          type: string
mcp:
  servers:
    - docs-index
    - name: billing-db
      config:
        readonly: true
context:
  inputs:
    - name: order_id
      non_empty: true
      allow_regex: /^[A-Z0-9-]+$/
---

# Prompt template

Find the order status for {{ order_id }}.

# Notes

Shows both tool declaration styles and MCP server references.
