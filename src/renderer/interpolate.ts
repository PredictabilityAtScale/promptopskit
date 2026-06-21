export interface InterpolateOptions {
  strict?: boolean;
  optionalVariables?: Iterable<string>;
  transformVariable?: (context: InterpolateVariableContext) => string;
}

export interface InterpolateVariableContext {
  name: string;
  value: string;
  modifier?: 'compress' | 'toon' | 'compact' | 'code';
  match: string;
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*\|\s*(compress|toon|compact|code))?\s*\}\}/g;
const ESCAPED_OPEN = /\\\{\\\{/g;
const ESCAPE_PLACEHOLDER = '\x00ESCAPED_OPEN\x00';

/**
 * Interpolate variables into a template string.
 *
 * Syntax: {{ variable_name }}
 * Escape: \{\{ produces literal {{
 *
 * In strict mode, throws on missing variables.
 * In permissive mode, leaves {{ placeholder }} intact.
 */
export function interpolate(
  template: string,
  variables: Record<string, string>,
  options: InterpolateOptions = {},
): string {
  const { strict = false } = options;
  const optionalVariables = new Set(options.optionalVariables ?? []);

  // Replace escaped sequences with placeholder
  let result = template.replace(ESCAPED_OPEN, ESCAPE_PLACEHOLDER);

  result = result.replace(VARIABLE_RE, (match, name: string, modifier: 'compress' | 'toon' | 'compact' | 'code' | undefined) => {
    if (name in variables) {
      const value = variables[name];
      return options.transformVariable
        ? options.transformVariable({ name, value, modifier, match })
        : value;
    }
    if (strict && !optionalVariables.has(name)) {
      throw new Error(`Missing required variable: "${name}"`);
    }
    return match; // leave placeholder intact in permissive mode
  });

  // Restore escaped sequences
  result = result.replaceAll(ESCAPE_PLACEHOLDER, '{{');

  return result;
}

/**
 * Extract all variable names referenced in a template.
 */
export function extractVariables(template: string): string[] {
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_RE.source, 'g');
  while ((match = re.exec(template)) !== null) {
    vars.add(match[1]);
  }
  return [...vars];
}
