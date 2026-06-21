# Compression and Compaction

PromptOpsKit supports opt-in compression before provider request generation. Compression never runs unless a prompt or placeholder asks for it.

## Prompt-template compression

Use TheTokenCompany when you want backend compression for the rendered `# Prompt template`:

```yaml
compression:
  thetokencompany:
    enabled: true
    model: bear-2
    aggressiveness: 0.2
```

At render time, pass your API key:

```typescript
const result = await kit.renderPrompt({
  path: 'support/reply',
  provider: 'openai',
  variables,
  theTokenCompany: {
    apiKey: process.env.THETOKENCOMPANY_API_KEY,
  },
});
```

Use the local heuristic compressor when you want no backend calls:

```yaml
compression:
  heuristic:
    enabled: true
    min_tokens: 120
    max_sentences: 8
    target_reduction: 0.45
    query_variable: user_question
```

The local compressor deduplicates text, scores sentences against `query`, `query_variable`, or system instructions, and keeps the highest-scoring sentences within the configured budget.

## JSON to TOON

When the input is a complete JSON object or array, enable TOON preprocessing:

```yaml
compression:
  heuristic:
    enabled: true
    json_to_toon: true
```

This converts JSON to TOON and preserves structured output instead of sentence-selecting through it. If the input is not a complete valid JSON object or array, PromptOpsKit leaves it unchanged and returns a `POK031` warning instead of text-compressing the broken JSON.

For one placeholder only:

```markdown
Payload:
{{ json_payload | toon }}
```

## Code Compaction

Code should not be text-compressed. Use code compaction instead:

```yaml
compression:
  code:
    enabled: true
    remove_comments: true
    trim_indentation: true
    collapse_blank_lines: true
```

For one placeholder only:

```markdown
Source:
{{ source_code | compact }}
```

Code compaction preserves code order and tokens while removing comments, common indentation, trailing whitespace, and blank lines by default. It does not perform AST minification.

If comments are semantically important, such as compiler pragmas, `@ts-ignore`, or generated-code markers, set `remove_comments: false`. When `compression.code.enabled: true`, PromptOpsKit skips TheTokenCompany prompt-template compression and returns a `POK033` warning so code is not sent through text compression.

## Placeholder Opt-In

Context inputs can opt in through schema:

```yaml
context:
  inputs:
    - name: account_context
      compression:
        heuristic:
          enabled: true
          query_variable: user_question
    - name: source_code
      compression: code
```

Or at the placeholder call site:

```markdown
Context: {{ account_context | compress }}
Payload: {{ json_payload | toon }}
Source: {{ source_code | compact }}
```

Placeholder modifiers are single-token shortcuts. Use `context.inputs[].compression` when a placeholder needs options such as `query_variable` or `remove_comments: false`.

## Reporting Savings

Render results include detailed per-step records plus a lightweight aggregate:

```typescript
const result = await kit.renderPrompt({ /* ... */ });

console.log(result.compressionSummary?.tokensSaved);
console.log(result.compression);
```

`compressionSummary` is an operation-level aggregate across compression and compaction steps. If a placeholder is compressed and the whole prompt is also compressed, the same source text can contribute to more than one step. Use `compression` for the per-step breakdown.

`compressionSummary` contains:

```typescript
{
  steps: number;
  inputTokens: number;
  outputTokens: number;
  tokensSaved: number;
  reductionRatio: number;
}
```

The same summary is also attached to `result.request.compressionSummary` when a provider request is produced.

## Credits

The local token-compression approach is based on Jason Kneen's [open-thetokenco](https://github.com/jasonkneen/open-thetokenco/tree/main).

TOON preprocessing uses a local encode-only implementation inspired by the MIT-licensed [TOON project](https://github.com/toon-format/toon) by Johann Schopplich, without adding `@toon-format/toon` as a runtime dependency.
