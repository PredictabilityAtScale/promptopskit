import { z } from 'zod';

// --- Tool definitions ---

export const InlineToolDefSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input_schema: z.record(z.unknown()).optional(),
});

export type InlineToolDef = z.infer<typeof InlineToolDefSchema>;

export const ToolRefSchema = z.union([z.string(), InlineToolDefSchema]);

// --- MCP ---

export const MCPServerRefSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    config: z.record(z.unknown()).optional(),
  }),
]);

export type MCPServerRef = z.infer<typeof MCPServerRefSchema>;

// --- Reasoning ---

export const ReasoningSchema = z.object({
  effort: z.enum(['low', 'medium', 'high']).optional(),
  budget_tokens: z.number().int().positive().optional(),
});

// --- Sampling ---

export const SamplingSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  stop: z.array(z.string()).optional(),
  max_output_tokens: z.number().int().positive().optional(),
});

// --- Response ---

export const ResponseSchema = z.object({
  format: z.enum(['text', 'json', 'markdown']).optional(),
  stream: z.boolean().optional(),
  schema: z.record(z.unknown()).optional(),
  schema_name: z.string().optional(),
  schema_description: z.string().optional(),
  schema_strict: z.boolean().optional(),
});


// --- Provider-specific options ---

export const AnthropicProviderOptionsSchema = z.object({
  top_k: z.number().int().min(0).optional(),
  tool_choice: z.record(z.unknown()).optional(),
  output_config: z.record(z.unknown()).optional(),
});

export const GeminiProviderOptionsSchema = z.object({
  candidate_count: z.number().int().positive().optional(),
  top_k: z.number().int().min(0).optional(),
  seed: z.number().int().optional(),
  response_schema: z.record(z.unknown()).optional(),
  response_json_schema: z.record(z.unknown()).optional(),
  response_modalities: z.array(z.string()).optional(),
  thinking_budget_tokens: z.number().int().positive().optional(),
});

export const OpenRouterProviderOptionsSchema = z.object({
  provider: z.record(z.unknown()).optional(),
  transforms: z.array(z.string()).optional(),
  plugins: z.array(z.record(z.unknown())).optional(),
  models: z.array(z.string()).optional(),
});

export const LLMAsAServiceCustomerSchema = z.object({
  customer_id: z.string(),
  customer_name: z.string().optional(),
  customer_user_id: z.string().optional(),
  customer_user_name: z.string().optional(),
  customer_user_email: z.string().optional(),
});

export const LLMAsAServiceProviderOptionsSchema = z.object({
  base_url: z.string().url().optional(),
  project_id: z.string().optional(),
  customer: LLMAsAServiceCustomerSchema.optional(),
  conversationId: z.string().optional(),
  conversationTitle: z.string().optional(),
  projectId: z.string().optional(),
});

export const ProviderOptionsSchema = z.object({
  anthropic: AnthropicProviderOptionsSchema.optional(),
  gemini: GeminiProviderOptionsSchema.optional(),
  openrouter: OpenRouterProviderOptionsSchema.optional(),
  llmasaservice: LLMAsAServiceProviderOptionsSchema.optional(),
});

export type ProviderOptions = z.infer<typeof ProviderOptionsSchema>;

// --- Raw provider body passthrough ---

export const RawProviderBodySchema = z.object({
  openai: z.record(z.unknown()).optional(),
  'openai-responses': z.record(z.unknown()).optional(),
  openai_responses: z.record(z.unknown()).optional(),
  anthropic: z.record(z.unknown()).optional(),
  gemini: z.record(z.unknown()).optional(),
  google: z.record(z.unknown()).optional(),
  openrouter: z.record(z.unknown()).optional(),
  llmasaservice: z.record(z.unknown()).optional(),
});

export type RawProviderBody = z.infer<typeof RawProviderBodySchema>;

// --- Cache controls ---

export const OpenAICacheSchema = z.object({
  prompt_cache_key: z.string().min(1).optional(),
  retention: z.enum(['in_memory', '24h']).optional(),
});

export const AnthropicCacheSchema = z.object({
  mode: z.enum(['automatic', 'explicit']).optional(),
  type: z.literal('ephemeral').optional(),
  ttl: z.enum(['5m', '1h']).optional(),
  cache_system_instructions: z.boolean().optional(),
  cache_tools: z.boolean().optional(),
  cache_prompt_template: z.boolean().optional(),
});

export const GeminiCacheSchema = z.object({
  cached_content: z.string().min(1).optional(),
});

export const CacheSchema = z.object({
  openai: OpenAICacheSchema.optional(),
  anthropic: AnthropicCacheSchema.optional(),
  gemini: GeminiCacheSchema.optional(),
  google: GeminiCacheSchema.optional(),
});

// --- Context ---

export const HistorySchema = z.object({
  max_items: z.number().int().positive().optional(),
});

export const ContextRegexSchema = z.union([
  z.string(),
  z.object({
    pattern: z.string(),
    flags: z.string().optional(),
    return_message: z.string().optional(),
  }),
]);

export const ContextBuiltInValidatorSchema = z.union([
  z.boolean(),
  z.object({
    return_message: z.string().optional(),
  }),
]);

export const ContextInputDefinitionObjectSchema = z.object({
  name: z.string(),
  max_size: z.number().int().positive().optional(),
  trim: z.union([z.boolean(), z.enum(['start', 'end', 'both'])]).optional(),
  allow_regex: ContextRegexSchema.optional(),
  deny_regex: ContextRegexSchema.optional(),
  non_empty: ContextBuiltInValidatorSchema.optional(),
  reject_secrets: ContextBuiltInValidatorSchema.optional(),
});

export const ContextInputDefinitionSchema = z.union([
  z.string(),
  ContextInputDefinitionObjectSchema,
]);

export type ContextInputDefinition = z.infer<typeof ContextInputDefinitionSchema>;
export type ContextRegexDefinition = z.infer<typeof ContextRegexSchema>;
export type ContextBuiltInValidatorDefinition = z.infer<typeof ContextBuiltInValidatorSchema>;

export const ContextSchema = z.object({
  inputs: z.array(ContextInputDefinitionSchema).optional(),
  history: HistorySchema.optional(),
});

// --- Metadata ---

export const MetadataSchema = z.object({
  owner: z.string().optional(),
  tags: z.array(z.string()).optional(),
  review_required: z.boolean().optional(),
  stable: z.boolean().optional(),
});

// --- MCP block ---

export const MCPSchema = z.object({
  servers: z.array(MCPServerRefSchema).optional(),
});

// --- Overrides (subset allowed in environments/tiers) ---

export const PromptAssetOverridesSchema = z.object({
  model: z.string().optional(),
  fallback_models: z.array(z.string()).optional(),
  reasoning: ReasoningSchema.optional(),
  sampling: SamplingSchema.optional(),
  response: ResponseSchema.optional(),
  cache: CacheSchema.optional(),
  raw: RawProviderBodySchema.optional(),
  tools: z.array(ToolRefSchema).optional(),
  provider_options: ProviderOptionsSchema.optional(),
});

export type PromptAssetOverrides = z.infer<typeof PromptAssetOverridesSchema>;

// --- Source tracking ---

export const SourceSchema = z.object({
  file_path: z.string().optional(),
  checksum: z.string().optional(),
});

// --- Sections (populated by parser) ---

export const SectionsSchema = z.object({
  system_instructions: z.string().optional(),
  prompt_template: z.string().optional(),
  notes: z.string().optional(),
});

// --- Defaults files (folder-level inheritance) ---

export const PromptDefaultsSchema = z.object({
  provider: z.enum(['openai', 'openai-responses', 'anthropic', 'google', 'gemini', 'openrouter', 'llmasaservice', 'any']).optional(),
  model: z.string().optional(),
  cache: CacheSchema.optional(),
  metadata: MetadataSchema.optional(),
  sections: z.object({
    system_instructions: z.string().optional(),
  }).optional(),
});

export type PromptDefaults = z.infer<typeof PromptDefaultsSchema>;

// --- Top-level PromptAsset ---

export const PromptAssetSchema = z.object({
  id: z.string(),
  schema_version: z.number().int().positive().default(1),
  description: z.string().optional(),

  provider: z.enum(['openai', 'openai-responses', 'anthropic', 'google', 'gemini', 'openrouter', 'llmasaservice', 'any']).optional(),
  model: z.string().optional(),
  fallback_models: z.array(z.string()).optional(),

  reasoning: ReasoningSchema.optional(),
  sampling: SamplingSchema.optional(),
  response: ResponseSchema.optional(),
  cache: CacheSchema.optional(),
  raw: RawProviderBodySchema.optional(),

  tools: z.array(ToolRefSchema).optional(),
  provider_options: ProviderOptionsSchema.optional(),
  mcp: MCPSchema.optional(),

  context: ContextSchema.optional(),

  includes: z.array(z.string()).optional(),

  environments: z.record(PromptAssetOverridesSchema).optional(),
  tiers: z.record(PromptAssetOverridesSchema).optional(),

  metadata: MetadataSchema.optional(),

  // Populated by parser, not authored in YAML
  sections: SectionsSchema.optional(),
  source: SourceSchema.optional(),
});

export type PromptAsset = z.infer<typeof PromptAssetSchema>;

// --- Resolved asset (after includes, overrides applied) ---

export interface ResolvedPromptAsset extends PromptAsset {
  sections: {
    system_instructions?: string;
    prompt_template?: string;
    notes?: string;
  };
  source: {
    file_path?: string;
    checksum?: string;
  };
}
