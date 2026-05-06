export interface InterpolateOptions {
  strict?: boolean;
}

const VARIABLE_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const ESCAPED_OPEN = /\\\{\\\{/g;
const ESCAPE_PLACEHOLDER = '\x00ESCAPED_OPEN\x00';

// --- Condition parsing ---

/**
 * A parsed condition from a block tag.
 *
 * Supports:
 *   {{#if var}}                → { variable, operator: 'truthy' }
 *   {{#if var == "value"}}     → { variable, operator: '==', comparand: 'value' }
 *   {{#if var != "value"}}     → { variable, operator: '!=', comparand: 'value' }
 *   {{#unless var}}            → same as above, inverted at evaluation time
 */
interface Condition {
  variable: string;
  operator: 'truthy' | '==' | '!=';
  comparand?: string;
}

// Matches: varName, varName == "val", varName != "val"
// Quotes can be double or single.
const CONDITION_RE =
  /([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*(==|!=)\s*(?:"([^"]*?)"|'([^']*?)'))?/;

function parseCondition(conditionStr: string): Condition | null {
  const m = CONDITION_RE.exec(conditionStr.trim());
  if (!m) return null;

  const variable = m[1];
  const operator = m[2] as '==' | '!=' | undefined;
  const comparand = m[3] ?? m[4]; // double-quote group or single-quote group

  if (operator && comparand !== undefined) {
    return { variable, operator, comparand };
  }

  return { variable, operator: 'truthy' };
}

/**
 * Evaluate a condition against the variables map.
 */
function evaluateCondition(condition: Condition, variables: Record<string, string>): boolean {
  const value = variables[condition.variable];

  switch (condition.operator) {
    case 'truthy':
      return value !== undefined && value !== '';
    case '==':
      return value !== undefined && value === condition.comparand;
    case '!=':
      return value === undefined || value !== condition.comparand;
  }
}

// --- Block tag patterns ---

// Opening tags: {{#if condition}} and {{#unless condition}}
// The condition part is captured broadly; parseCondition() handles the details.
const BLOCK_IF_OPEN_RE = /\{\{#if\s+([^}]+?)\s*\}\}/;
const BLOCK_UNLESS_OPEN_RE = /\{\{#unless\s+([^}]+?)\s*\}\}/;

// Else-if tag: {{else if condition}}
const BLOCK_ELSE_IF_RE = /\{\{else\s+if\s+([^}]+?)\s*\}\}/;

// Simple else and close tags
const BLOCK_ELSE_RE = /\{\{else\}\}/;
const BLOCK_IF_CLOSE_RE = /\{\{\/if\}\}/;
const BLOCK_UNLESS_CLOSE_RE = /\{\{\/unless\}\}/;

// For extracting condition variable names (used by extractVariables)
const BLOCK_CONDITION_EXTRACT_RE =
  /\{\{(?:#(?:if|unless)|else\s+if)\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*(?:==|!=)\s*(?:"[^"]*?"|'[^']*?'))?\s*\}\}/g;

// --- Block types ---

interface ConditionalBranch {
  condition: Condition;
  content: string;
}

interface ConditionalBlock {
  kind: 'if' | 'unless';
  branches: ConditionalBranch[];  // first branch is the {{#if}} condition
  elseContent: string;            // final {{else}} fallback (may be '')
  fullMatch: string;
}

/**
 * Find the outermost conditional block in the template.
 * Returns null if no block is found.
 *
 * This uses a counter-based approach: find the first opening tag,
 * then scan forward tracking nesting depth to find the matching
 * {{else if}}, {{else}}, and {{/if}} or {{/unless}} at depth 0.
 */
function findOutermostBlock(template: string): ConditionalBlock | null {
  // Find the first opening tag (either {{#if}} or {{#unless}})
  const ifMatch = BLOCK_IF_OPEN_RE.exec(template);
  const unlessMatch = BLOCK_UNLESS_OPEN_RE.exec(template);

  let openMatch: RegExpExecArray | null = null;
  let kind: 'if' | 'unless';

  if (ifMatch && unlessMatch) {
    if (ifMatch.index <= unlessMatch.index) {
      openMatch = ifMatch;
      kind = 'if';
    } else {
      openMatch = unlessMatch;
      kind = 'unless';
    }
  } else if (ifMatch) {
    openMatch = ifMatch;
    kind = 'if';
  } else if (unlessMatch) {
    openMatch = unlessMatch;
    kind = 'unless';
  } else {
    return null;
  }

  const openCondition = parseCondition(openMatch[1]);
  if (!openCondition) return null;

  const contentStart = openMatch.index + openMatch[0].length;
  const remaining = template.slice(contentStart);

  // Scan through remaining text tracking depth, collecting branch boundaries
  let depth = 0;
  let closeIndex = -1; // relative to contentStart
  let closeLength = 0;

  // Branch boundary tracking: positions of {{else if ...}} and {{else}} at depth 0
  interface BranchBoundary {
    kind: 'else-if' | 'else';
    position: number;  // start of the tag (relative to remaining)
    length: number;    // length of the tag
    condition?: Condition;
  }
  const boundaries: BranchBoundary[] = [];

  let pos = 0;
  while (pos < remaining.length) {
    const sub = remaining.slice(pos);

    // Check for any opening block tag (nesting)
    const anyOpen = /^\{\{#(?:if|unless)\s+[^}]+?\s*\}\}/.exec(sub);
    if (anyOpen) {
      depth++;
      pos += anyOpen[0].length;
      continue;
    }

    // Check for {{else if condition}} at depth 0
    const elseIfMatch = /^\{\{else\s+if\s+([^}]+?)\s*\}\}/.exec(sub);
    if (elseIfMatch && depth === 0) {
      const cond = parseCondition(elseIfMatch[1]);
      if (cond) {
        boundaries.push({
          kind: 'else-if',
          position: pos,
          length: elseIfMatch[0].length,
          condition: cond,
        });
      }
      pos += elseIfMatch[0].length;
      continue;
    }

    // Check for {{else}} at depth 0
    const elseMatch = /^\{\{else\}\}/.exec(sub);
    if (elseMatch && depth === 0) {
      boundaries.push({
        kind: 'else',
        position: pos,
        length: elseMatch[0].length,
      });
      pos += elseMatch[0].length;
      continue;
    }

    // Skip {{else}} / {{else if}} at depth > 0
    if (depth > 0 && (elseIfMatch || elseMatch)) {
      pos += (elseIfMatch ?? elseMatch)![0].length;
      continue;
    }

    // Check for any closing block tag
    const anyClose = /^\{\{\/(?:if|unless)\}\}/.exec(sub);
    if (anyClose) {
      if (depth === 0) {
        closeIndex = pos;
        closeLength = anyClose[0].length;
        break;
      }
      depth--;
      pos += anyClose[0].length;
      continue;
    }

    pos++;
  }

  if (closeIndex === -1) {
    // Unclosed block — leave it as-is (don't crash, just skip)
    return null;
  }

  // Build branches from boundaries
  const branches: ConditionalBranch[] = [];
  let elseContent = '';

  // First branch: from start to first boundary (or close)
  const firstEnd = boundaries.length > 0 ? boundaries[0].position : closeIndex;
  branches.push({
    condition: openCondition,
    content: remaining.slice(0, firstEnd),
  });

  // Middle branches (else-if) and final else
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextEnd = i + 1 < boundaries.length
      ? boundaries[i + 1].position
      : closeIndex;
    const branchContent = remaining.slice(boundary.position + boundary.length, nextEnd);

    if (boundary.kind === 'else-if' && boundary.condition) {
      branches.push({
        condition: boundary.condition,
        content: branchContent,
      });
    } else {
      // Final {{else}} — everything from here to {{/if}}
      elseContent = branchContent;
    }
  }

  const fullMatchEnd = contentStart + closeIndex + closeLength;
  const fullMatch = template.slice(openMatch.index, fullMatchEnd);

  return { kind, branches, elseContent, fullMatch };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process all conditional blocks in a template.
 * Evaluates {{#if}}/{{else if}}/{{else}}/{{/if}} and {{#unless}} blocks.
 *
 * Blocks are processed iteratively from the outermost inward.
 * Conditionals are always permissive: a missing/empty variable evaluates
 * as falsy (never throws), because conditionals are semantically about optionality.
 */
function processConditionals(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;
  let safety = 0;
  const MAX_ITERATIONS = 100;

  while (safety++ < MAX_ITERATIONS) {
    const block = findOutermostBlock(result);
    if (!block) break;

    let winning: string | null = null;

    if (block.kind === 'if') {
      // Evaluate branches in order; first truthy wins
      for (const branch of block.branches) {
        if (evaluateCondition(branch.condition, variables)) {
          winning = branch.content;
          break;
        }
      }
      if (winning === null) {
        winning = block.elseContent;
      }
    } else {
      // unless: only the first branch condition is inverted
      // (else-if on unless blocks would be unusual, but we handle it)
      const firstBranch = block.branches[0];
      if (!evaluateCondition(firstBranch.condition, variables)) {
        winning = firstBranch.content;
      } else if (block.branches.length > 1) {
        for (let i = 1; i < block.branches.length; i++) {
          if (evaluateCondition(block.branches[i].condition, variables)) {
            winning = block.branches[i].content;
            break;
          }
        }
      }
      if (winning === null) {
        winning = block.elseContent;
      }
    }

    // Strip leading/trailing newline from the winning content if the block tags
    // were on standalone lines. This prevents extra blank lines in output.
    winning = stripBlockContentWhitespace(winning);

    result = result.replace(block.fullMatch, winning);
  }

  return result;
}

/**
 * Trim exactly one leading newline and one trailing newline from block content,
 * which arise from the tag lines themselves.
 */
function stripBlockContentWhitespace(content: string): string {
  let result = content;
  if (result.startsWith('\n')) {
    result = result.slice(1);
  }
  if (result.endsWith('\n')) {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * Interpolate variables into a template string.
 *
 * Syntax:
 *   {{ variable_name }}                        — variable substitution
 *   {{#if var}}...{{/if}}                      — conditional (truthy = exists and non-empty)
 *   {{#if var == "value"}}...{{/if}}           — string equality comparison
 *   {{#if var != "value"}}...{{/if}}           — string inequality comparison
 *   {{#if var}}...{{else if var2}}...{{/if}}   — chained conditions
 *   {{#if var}}...{{else}}...{{/if}}           — conditional with fallback
 *   {{#unless var}}...{{/unless}}              — inverted conditional
 *   \{\{ produces literal {{
 *
 * In strict mode, throws on missing variables (but NOT for conditional checks,
 * since conditionals are semantically about optionality).
 * In permissive mode, leaves {{ placeholder }} intact.
 */
export function interpolate(
  template: string,
  variables: Record<string, string>,
  options: InterpolateOptions = {},
): string {
  const { strict = false } = options;

  // Replace escaped sequences with placeholder
  let result = template.replace(ESCAPED_OPEN, ESCAPE_PLACEHOLDER);

  // Phase 1: Process conditional blocks (always permissive)
  result = processConditionals(result, variables);

  // Phase 2: Variable substitution
  result = result.replace(VARIABLE_RE, (match, name: string) => {
    if (name in variables) {
      return variables[name];
    }
    if (strict) {
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
 * Includes variables used in {{#if var}}, {{#unless var}},
 * {{#if var == "value"}}, and {{else if var}} conditions.
 */
export function extractVariables(template: string): string[] {
  const vars = new Set<string>();

  // Extract from variable substitutions: {{ var }}
  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_RE.source, 'g');
  while ((match = re.exec(template)) !== null) {
    vars.add(match[1]);
  }

  // Extract from conditional block tags: {{#if var}}, {{#unless var}}, {{else if var}}
  const condRe = new RegExp(BLOCK_CONDITION_EXTRACT_RE.source, 'g');
  while ((match = condRe.exec(template)) !== null) {
    vars.add(match[1]);
  }

  return [...vars];
}
