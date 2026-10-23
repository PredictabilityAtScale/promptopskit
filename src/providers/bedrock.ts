import { z } from 'zod';
import type { ResolvedPromptAsset } from '../schema/index.js';
import {
  BedrockGuardrailConfigSchema,
  BedrockJsonValueSchema,
  BedrockProviderOptionsSchema,
  BedrockToolChoiceSchema,
  InlineToolDefSchema,
} from '../schema/schema.js';
import { renderSections } from '../renderer/index.js';
import { compactHistoryForPrompt } from '../history.js';
import type { ProviderAdapter, ProviderRequest, RuntimeRenderOptions, ValidationResult } from './types.js';
import { withPromptInputSupport } from './prompt-input.js';
import { resolveAssetForProvider } from './resolve-asset.js';
import { applyRawProviderBody } from './raw.js';
import { bedrockSchemaWarnings } from './bedrock-schema.js';

export const BEDROCK_DEFAULT_MAX_TOKENS = 4096;

const cachePointSchema = z.object({
  cachePoint: z.object({ type: z.literal('default'), ttl: z.enum(['5m', '1h']).optional() }).strict(),
}).strict();
const textBlockSchema = z.object({ text: z.string().min(1) }).strict();
const textHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
}).strict();
const toolSchema = z.object({
  toolSpec: z.object({
    name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    description: z.string().min(1).optional(),
    inputSchema: z.object({
      json: z.record(BedrockJsonValueSchema).refine((schema) => schema.type === 'object', {
        message: 'Bedrock tool input schema must have type: object at its root.',
      }),
    }).strict(),
    strict: z.boolean().optional(),
  }).strict(),
}).strict();

// Structural SDK-compatible types keep AWS packages out of the runtime and declarations.
const converseInputSchema = z.object({
  modelId: z.string().trim().min(1),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.array(z.union([textBlockSchema, cachePointSchema])).min(1),
  }).strict()).min(1),
  system: z.array(z.union([textBlockSchema, cachePointSchema])).optional(),
  inferenceConfig: z.object({
    maxTokens: z.number().int().positive(),
    temperature: z.number().min(0).max(1).optional(),
    topP: z.number().min(0).max(1).optional(),
    stopSequences: z.array(z.string().min(1)).max(2500).optional(),
  }).strict(),
  toolConfig: z.object({
    tools: z.array(z.union([toolSchema, cachePointSchema])).min(1),
    toolChoice: BedrockToolChoiceSchema.optional(),
  }).strict().optional(),
  outputConfig: z.object({
    textFormat: z.object({
      type: z.literal('json_schema'),
      structure: z.object({ jsonSchema: z.object({
        schema: z.string(), name: z.string().optional(), description: z.string().optional(),
      }).strict() }).strict(),
    }).strict(),
  }).strict().optional(),
  additionalModelRequestFields: z.record(BedrockJsonValueSchema).optional(),
  additionalModelResponseFieldPaths: z.array(z.string().min(1)).optional(),
  guardrailConfig: BedrockGuardrailConfigSchema.extend({
    streamProcessingMode: z.enum(['sync', 'async']).optional(),
  }).optional(),
  requestMetadata: z.record(z.string()).optional(),
  performanceConfig: BedrockProviderOptionsSchema.shape.performance_config,
  serviceTier: BedrockProviderOptionsSchema.shape.service_tier,
}).passthrough();

/** Input for ConverseCommand or ConverseStreamCommand, not an HTTP request body. */
export type BedrockConverseInput = z.infer<typeof converseInputSchema>;
export interface BedrockProviderRequest extends ProviderRequest {
  provider: 'bedrock';
  operation: 'converse' | 'converse-stream';
  body: BedrockConverseInput;
}

function issues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`);
}

function parseTextHistory(history: RuntimeRenderOptions['history']) {
  const parsed = z.array(textHistoryMessageSchema).safeParse(history ?? []);
  if (!parsed.success) {
    throw new Error(`Bedrock text history supports only user/assistant roles and non-empty text, without native tool fields: ${issues(parsed.error).join('; ')}`);
  }
  return parsed.data;
}

function resolveTool(tool: NonNullable<ResolvedPromptAsset['tools']>[number], runtime?: RuntimeRenderOptions) {
  const definition = typeof tool === 'string' ? runtime?.toolRegistry?.[tool] : tool;
  if (!definition) throw new Error(`Bedrock tool "${tool}" requires a toolRegistry definition.`);
  if (typeof definition === 'object' && 'toolSpec' in definition) return toolSchema.parse(definition);
  const parsed = InlineToolDefSchema.parse(definition);
  return toolSchema.parse({ toolSpec: {
    name: parsed.name,
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
    inputSchema: { json: parsed.input_schema ?? { type: 'object', properties: {} } },
  } });
}

function validate(asset: ResolvedPromptAsset, runtime?: RuntimeRenderOptions): ValidationResult {
  const resolved = resolveAssetForProvider(asset, runtime);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!resolved.model?.trim()) errors.push('Bedrock adapter requires an exact model or inference profile ID/ARN.');
  if (resolved.model?.includes(':prompt/')) errors.push('Bedrock managed prompt ARNs are not supported; PromptOpsKit renders the prompt content.');
  const options = BedrockProviderOptionsSchema.safeParse(resolved.provider_options?.bedrock ?? {});
  if (!options.success) errors.push(...issues(options.error));
  if (resolved.sampling?.temperature !== undefined && (resolved.sampling.temperature < 0 || resolved.sampling.temperature > 1)) {
    errors.push('Bedrock sampling.temperature must be between 0 and 1.');
  }
  for (const key of ['frequency_penalty', 'presence_penalty'] as const) {
    if (resolved.sampling?.[key] !== undefined) warnings.push(`Bedrock Converse does not map sampling.${key}; it will be ignored.`);
  }
  if (resolved.reasoning?.effort !== undefined || resolved.reasoning?.budget_tokens !== undefined) {
    warnings.push('Bedrock reasoning is model-specific. Use provider_options.bedrock.additional_model_request_fields; normalized reasoning is not mapped.');
  }
  if (resolved.response?.format === 'json' && !resolved.response.schema) warnings.push('Bedrock response.format: json requires response.schema for enforced JSON output. No JSON constraint will be sent.');
  if (resolved.response?.schema) {
    warnings.push(...bedrockSchemaWarnings(resolved.response.schema));
    if (resolved.response.schema_strict !== undefined) warnings.push('Bedrock schema_strict has no universal mapping. Use model-specific additional_model_request_fields when required.');
  }
  try {
    parseTextHistory(runtime?.history);
  } catch (error) {
    errors.push((error as Error).message);
  }
  for (const tool of resolved.tools ?? []) {
    if (typeof tool === 'string' && runtime === undefined) {
      warnings.push(`Bedrock tool "${tool}" must be resolved through toolRegistry before rendering.`);
    } else {
      try { resolveTool(tool, runtime); } catch (error) {
        errors.push(error instanceof z.ZodError ? `Invalid Bedrock tool: ${issues(error).join('; ')}` : (error as Error).message);
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

/** Pure native Bedrock rendering. AWS client configuration and invocation are caller-owned. */
export const bedrockAdapter: ProviderAdapter<BedrockProviderRequest> = withPromptInputSupport({
  name: 'bedrock',
  validate,
  render(asset, runtime): BedrockProviderRequest {
    const resolved = resolveAssetForProvider(asset, runtime);
    const validation = validate(resolved, runtime);
    if (!validation.valid) throw new Error(`Bedrock validation failed:\n${validation.errors.join('\n')}`);
    const options = BedrockProviderOptionsSchema.parse(resolved.provider_options?.bedrock ?? {});
    const sections = renderSections(resolved, { variables: runtime.variables, strict: runtime.strict });
    // Validate callback output too, before projection can discard extra native fields.
    const history = parseTextHistory(compactHistoryForPrompt(resolved, runtime));
    const cache = resolved.cache?.bedrock;
    const checkpoint = { cachePoint: { type: 'default' as const, ...(cache?.ttl ? { ttl: cache.ttl } : {}) } };
    const messages: BedrockConverseInput['messages'] = history.map((message) => ({
      role: message.role, content: [{ text: message.content }],
    }));
    if (sections.prompt_template) messages.push({ role: 'user', content: [
      { text: sections.prompt_template }, ...(cache?.cache_prompt_template ? [checkpoint] : []),
    ] });
    const tools = (resolved.tools ?? []).map((tool) => resolveTool(tool, runtime));
    const sampling = resolved.sampling;
    const body: Record<string, unknown> = {
      modelId: resolved.model,
      messages,
      inferenceConfig: {
        maxTokens: sampling?.max_output_tokens ?? BEDROCK_DEFAULT_MAX_TOKENS,
        ...(sampling?.temperature !== undefined ? { temperature: sampling.temperature } : {}),
        ...(sampling?.top_p !== undefined ? { topP: sampling.top_p } : {}),
        ...(sampling?.stop !== undefined ? { stopSequences: sampling.stop } : {}),
      },
    };
    if (sections.system_instructions) body.system = [
      { text: sections.system_instructions }, ...(cache?.cache_system_instructions ? [checkpoint] : []),
    ];
    if (tools.length) body.toolConfig = {
      tools: [...tools, ...(cache?.cache_tools ? [checkpoint] : [])],
      ...(options.tool_choice ? { toolChoice: options.tool_choice } : {}),
    };
    if (options.tool_choice && !tools.length && !resolved.raw?.bedrock?.toolConfig) throw new Error('Bedrock tool_choice requires tools.');
    if (resolved.response?.schema) body.outputConfig = { textFormat: {
      type: 'json_schema', structure: { jsonSchema: {
        schema: JSON.stringify(resolved.response.schema),
        name: resolved.response.schema_name ?? `${resolved.id}_response`,
        ...(resolved.response.schema_description ? { description: resolved.response.schema_description } : {}),
      } },
    } };
    const mappings = {
      additional_model_request_fields: 'additionalModelRequestFields',
      additional_model_response_field_paths: 'additionalModelResponseFieldPaths',
      guardrail_config: 'guardrailConfig', request_metadata: 'requestMetadata',
      performance_config: 'performanceConfig', service_tier: 'serviceTier',
    } as const;
    for (const [key, target] of Object.entries(mappings)) {
      const value = options[key as keyof typeof mappings];
      if (value !== undefined) body[target] = value;
    }
    const merged = applyRawProviderBody(body, resolved, 'bedrock');
    for (const key of [
      'model', 'stream', 'region', 'credentials', 'headers', 'apiKey',
      'accessKeyId', 'secretAccessKey', 'sessionToken', 'endpoint', 'baseURL', 'baseUrl', 'profile',
    ]) {
      if (key in merged) throw new Error(`Bedrock raw.${key} is not command input; keep transport/authentication in the application.`);
    }
    if (merged.modelId !== resolved.model) throw new Error('Bedrock raw.modelId must match the resolved model. Override model through runtime.model instead.');
    const parsed = converseInputSchema.safeParse(merged);
    if (!parsed.success) throw new Error(`Invalid Bedrock command input:\n${issues(parsed.error).join('\n')}`);
    const input = parsed.data;
    const names = input.toolConfig?.tools.flatMap((tool) => 'toolSpec' in tool ? [tool.toolSpec.name] : []) ?? [];
    if (new Set(names).size !== names.length) throw new Error('Bedrock tool names must be unique.');
    const choice = input.toolConfig?.toolChoice;
    if (choice && 'tool' in choice && !names.includes(choice.tool.name)) throw new Error(`Bedrock tool_choice references an undefined tool: ${choice.tool.name}`);
    if (input.guardrailConfig?.streamProcessingMode && !resolved.response?.stream) throw new Error('Bedrock streamProcessingMode requires response.stream: true.');
    return {
      provider: 'bedrock', model: input.modelId, body: input,
      operation: resolved.response?.stream ? 'converse-stream' : 'converse',
      ...(validation.warnings.length ? { warnings: validation.warnings } : {}),
    };
  },
}, { validateBeforeRender: true });
