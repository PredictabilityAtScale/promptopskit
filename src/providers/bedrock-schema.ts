/** Inspect schema keywords, without treating property names as keywords. */
export function bedrockSchemaWarnings(schema: Record<string, unknown>): string[] {
  const unsupported = new Set<string>();
  const keywords = new Set([
    'patternProperties', 'unevaluatedProperties', '$dynamicRef',
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'minLength', 'maxLength',
  ]);
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (keywords.has(key)) unsupported.add(key);
      if (key === '$ref' && typeof child === 'string' && !child.startsWith('#')) unsupported.add('external $ref');
      if (key === 'additionalProperties' && child !== false) unsupported.add('additionalProperties other than false');
      if (['properties', '$defs', 'definitions', 'dependentSchemas'].includes(key)) {
        if (child && typeof child === 'object') Object.values(child).forEach(visit);
      } else if (['items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains'].includes(key)) {
        visit(child);
      } else if (['anyOf', 'allOf', 'oneOf', 'prefixItems'].includes(key) && Array.isArray(child)) {
        child.forEach(visit);
      }
    }
  }
  visit(schema);
  return unsupported.size ? [
    `Bedrock response.schema contains provider-sensitive constraints: ${[...unsupported].join(', ')}. Check the selected model's JSON Schema subset; constraints are preserved.`,
  ] : [];
}
