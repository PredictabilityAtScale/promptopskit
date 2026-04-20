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
});

// --- Context ---

export const HistorySchema = z.object({
  max_items: z.number().int().positive().optional(),
});

export const ContextSchema = z.object({
  inputs: z.array(z.string()).optional(),
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
  tools: z.array(ToolRefSchema).optional(),
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

  provider: z.enum(['openai', 'anthropic', 'google', 'gemini', 'openrouter', 'any']).optional(),
  model: z.string().optional(),
  fallback_models: z.array(z.string()).optional(),

  reasoning: ReasoningSchema.optional(),
  sampling: SamplingSchema.optional(),
  response: ResponseSchema.optional(),

  tools: z.array(ToolRefSchema).optional(),
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
