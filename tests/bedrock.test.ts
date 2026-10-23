import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { bedrockAdapter, BEDROCK_DEFAULT_MAX_TOKENS } from '../src/providers/bedrock.js';
import { bedrockAdapter as rootAdapter, createPromptOpsKit } from '../src/index.js';
import { getAdapter } from '../src/providers/index.js';
import { PromptAssetSchema, PromptDefaultsSchema } from '../src/schema/index.js';
import type { ResolvedPromptAsset } from '../src/schema/index.js';
import { validateAsset } from '../src/validation/index.js';
import { compile } from '../src/cli/commands/compile.js';

const model = 'us.anthropic.claude-sonnet-4-6';
const asset: ResolvedPromptAsset = {
  id: 'support/reply', schema_version: 1, provider: 'bedrock', model,
  sections: { system_instructions: 'Follow policy.', prompt_template: 'Hello {{ name }}.' }, source: {},
};
const schema = {
  type: 'object', properties: { answer: { type: 'string' } },
  required: ['answer'], additionalProperties: false,
};
const tool = { name: 'lookup', description: 'Look up a ticket', input_schema: schema };
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('native Bedrock adapter', () => {
  it('registers the provider and accepts prompt/defaults metadata without AWS settings', () => {
    expect(getAdapter('bedrock')).toBe(rootAdapter);
    expect(PromptAssetSchema.parse(asset).provider).toBe('bedrock');
    expect(PromptDefaultsSchema.parse({ provider: 'bedrock' }).provider).toBe('bedrock');
  });

  it('renders SDK command input and text history without transport or auth', () => {
    const request = bedrockAdapter.render({ ...asset, sampling: {
      max_output_tokens: 500, temperature: 0, top_p: 0.8, stop: ['END'],
    } }, { variables: { name: 'Ada' }, history: [
      { role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' },
    ] });
    expect(request).toEqual({ provider: 'bedrock', model, operation: 'converse', body: {
      modelId: model, system: [{ text: 'Follow policy.' }],
      messages: [
        { role: 'user', content: [{ text: 'Earlier question' }] },
        { role: 'assistant', content: [{ text: 'Earlier answer' }] },
        { role: 'user', content: [{ text: 'Hello Ada.' }] },
      ],
      inferenceConfig: { maxTokens: 500, temperature: 0, topP: 0.8, stopSequences: ['END'] },
    } });
  });

  it.each([true, false])('selects the command for response.stream=%s outside the input', (stream) => {
    const request = bedrockAdapter.render({ ...asset, response: { stream } }, { variables: { name: 'Ada' } });
    expect(request.operation).toBe(stream ? 'converse-stream' : 'converse');
    expect(request.body).not.toHaveProperty('stream');
    expect(request.body.inferenceConfig.maxTokens).toBe(BEDROCK_DEFAULT_MAX_TOKENS);
    expect(request.body).not.toHaveProperty('model');
  });

  it('preserves exact inference-profile ARNs and runtime model overrides', () => {
    const arn = 'arn:aws:bedrock:us-west-2:123456789012:application-inference-profile/example';
    const request = bedrockAdapter.render(asset, { variables: { name: 'Ada' }, runtime: { model: arn } });
    expect(request.model).toBe(arn);
    expect(request.body.modelId).toBe(arn);
  });

  it('maps inline, neutral registry, and native registry tools with forced tool choice', () => {
    const request = bedrockAdapter.render({ ...asset, tools: [tool, 'registry', 'native'], provider_options: {
      bedrock: { tool_choice: { tool: { name: 'lookup' } } },
    } }, { variables: { name: 'Ada' }, toolRegistry: {
      registry: { ...tool, name: 'registry' },
      native: { toolSpec: { name: 'native', strict: true, inputSchema: { json: schema } } },
    } });
    expect(request.body.toolConfig).toEqual({ tools: [
      { toolSpec: { name: 'lookup', description: tool.description, inputSchema: { json: schema } } },
      { toolSpec: { name: 'registry', description: tool.description, inputSchema: { json: schema } } },
      { toolSpec: { name: 'native', strict: true, inputSchema: { json: schema } } },
    ], toolChoice: { tool: { name: 'lookup' } } });
  });

  it('serializes structured output and preserves model-specific extension fields', () => {
    const request = bedrockAdapter.render({ ...asset, response: {
      format: 'json', schema, schema_name: 'reply', schema_description: 'A reply',
    }, provider_options: { bedrock: {
      additional_model_request_fields: { thinking: { type: 'enabled', budget_tokens: 1024 } },
      additional_model_response_field_paths: ['/stop_sequence'],
      guardrail_config: { guardrailIdentifier: 'guardrail', guardrailVersion: '1', trace: 'disabled' },
      request_metadata: { feature: 'support' }, performance_config: { latency: 'standard' },
      service_tier: { type: 'default' },
    } } }, { variables: { name: 'Ada' } });
    expect(request.body.outputConfig?.textFormat.structure.jsonSchema).toEqual({
      name: 'reply', description: 'A reply', schema: JSON.stringify(schema),
    });
    expect(request.body.additionalModelRequestFields).toEqual({ thinking: { type: 'enabled', budget_tokens: 1024 } });
    expect(request.body.additionalModelResponseFieldPaths).toEqual(['/stop_sequence']);
    expect(request.body.guardrailConfig?.guardrailVersion).toBe('1');
    expect(request.body.requestMetadata).toEqual({ feature: 'support' });
    expect(request.body.serviceTier).toEqual({ type: 'default' });
  });

  it('adds only explicitly selected cache checkpoints after content and tools', () => {
    const request = bedrockAdapter.render({ ...asset, tools: [tool], cache: { bedrock: {
      ttl: '1h', cache_system_instructions: true, cache_tools: true, cache_prompt_template: true,
    } } }, { variables: { name: 'Ada' } });
    const point = { cachePoint: { type: 'default', ttl: '1h' } };
    expect(request.body.system).toEqual([{ text: 'Follow policy.' }, point]);
    expect(request.body.messages[0].content).toEqual([{ text: 'Hello Ada.' }, point]);
    expect(request.body.toolConfig?.tools.at(-1)).toEqual(point);
    const uncached = bedrockAdapter.render({ ...asset, cache: { bedrock: { ttl: '5m' } } }, { variables: { name: 'Ada' } });
    expect(uncached.body.system).toEqual([{ text: 'Follow policy.' }]);
    expect(uncached.body.messages[0].content).toEqual([{ text: 'Hello Ada.' }]);
  });

  it('shallow-merges only raw.bedrock after normalized fields', () => {
    const request = bedrockAdapter.render({ ...asset, raw: {
      openai: { model: 'wrong-provider' }, bedrock: { inferenceConfig: { maxTokens: 100 }, requestMetadata: { source: 'raw' } },
    } }, { variables: { name: 'Ada' } });
    expect(request.body.inferenceConfig).toEqual({ maxTokens: 100 });
    expect(request.body.requestMetadata).toEqual({ source: 'raw' });
  });

  it('keeps streaming-only guardrail options out of buffered calls', () => {
    const input = { ...asset, raw: { bedrock: { guardrailConfig: {
      guardrailIdentifier: 'guardrail', guardrailVersion: '1', streamProcessingMode: 'async',
    } } } };
    expect(() => bedrockAdapter.render(input, { variables: { name: 'Ada' } })).toThrow('requires response.stream');
    expect(bedrockAdapter.render({ ...input, response: { stream: true } }, { variables: { name: 'Ada' } }).body.guardrailConfig?.streamProcessingMode).toBe('async');
  });

  it('keeps adapter warnings when the compression pipeline also emits a warning', async () => {
    const request = await bedrockAdapter.renderPrompt({
      ...asset, response: { format: 'json' }, sections: { prompt_template: '{{ payload | toon }}' },
    }, { variables: { payload: 'not-json' } });
    expect(request.body?.messages).toEqual([{ role: 'user', content: [{ text: 'not-json' }] }]);
    if (!request.body) throw new Error('Expected a rendered request');
    expect(request.warnings?.join(' ')).toContain('response.format: json');
    expect(request.warnings?.join(' ')).toContain('POK031');
  });

  it.each(['system', 'developer', 'tool'])('rejects %s history instead of discarding it', (role) => {
    expect(() => bedrockAdapter.render(asset, { variables: { name: 'Ada' }, history: [{ role, content: 'text' }] }))
      .toThrow('only user/assistant');
  });

  it('validates original history before async compaction can flatten unsupported turns', async () => {
    const compact = vi.fn(() => 'compacted');
    await expect(bedrockAdapter.renderPrompt({ ...asset, context: { history: { max_items: 1 } } }, {
      variables: { name: 'Ada' },
      history: [{ role: 'tool', content: 'result' }, { role: 'user', content: 'question' }],
      onHistoryCompaction: compact,
    })).rejects.toThrow('only user/assistant');
    expect(compact).not.toHaveBeenCalled();
  });

  it('rejects assistant tool-call history instead of silently losing the tool protocol', () => {
    const history = [{ role: 'assistant', content: 'I will look that up.', tool_calls: [{ id: 'call-1' }] }];
    expect(() => bedrockAdapter.render(asset, { variables: { name: 'Ada' }, history }))
      .toThrow(/text history|tool_calls/);
  });

  it('validates custom compaction output before shaping native text messages', () => {
    const history = [{ role: 'user', content: 'Question' }, { role: 'assistant', content: 'Answer' }];
    expect(() => bedrockAdapter.render({ ...asset, context: { history: { max_items: 1 } } }, {
      variables: { name: 'Ada' }, history,
      onHistoryCompaction: () => ({ role: 'assistant', content: 'Summary', tool_calls: [{ id: 'call-1' }] }),
    })).toThrow(/text history|tool_calls/);
  });

  it.each(['string', 'array', 'number'])('rejects a tool schema with %s at its root', (type) => {
    expect(() => bedrockAdapter.render({ ...asset, tools: [{ name: 'lookup', input_schema: { type } }] }, { variables: { name: 'Ada' } }))
      .toThrow(/object/);
  });

  it.each([
    [{ model: '' }, 'exact model'],
    [{ model: 'arn:aws:bedrock:us-east-1:123456789012:prompt/PROMPT:1' }, 'managed prompt'],
    [{ sampling: { temperature: 1.5 } }, 'between 0 and 1'],
    [{ sampling: { max_output_tokens: 0 } }, 'maxTokens'],
    [{ sampling: { stop: [''] } }, 'stopSequences'],
    [{ raw: { bedrock: { modelId: 'different' } } }, 'must match'],
    [{ raw: { bedrock: { stream: true } } }, 'not command input'],
    [{ raw: { bedrock: { inferenceConfig: { temperature: 0.2 } } } }, 'maxTokens'],
    [{ tools: ['missing'] }, 'toolRegistry'],
    [{ tools: [{ name: 'bad name' }] }, 'Invalid Bedrock tool'],
    [{ tools: [tool, tool] }, 'unique'],
    [{ provider_options: { bedrock: { tool_choice: { any: {} } } } }, 'requires tools'],
    [{ tools: [tool], provider_options: { bedrock: { tool_choice: { tool: { name: 'missing' } } } } }, 'undefined tool'],
    [{ sections: {} }, 'messages'],
  ] as const)('rejects malformed input %j', (override, message) => {
    expect(() => bedrockAdapter.render({ ...asset, ...override } as ResolvedPromptAsset, { variables: { name: 'Ada' } }))
      .toThrow(message);
  });

  it('rejects transport options in typed config and invalid tool-choice unions', () => {
    expect(PromptAssetSchema.safeParse({ ...asset, provider_options: { bedrock: { region: 'us-east-1' } } }).success).toBe(false);
    expect(PromptAssetSchema.safeParse({ ...asset, provider_options: { bedrock: { tool_choice: { auto: {}, any: {} } } } }).success).toBe(false);
  });

  it('warns about unmapped settings and preserves schema constraints', () => {
    const constrained = { ...schema, properties: { answer: { type: 'string', minLength: 3 } } };
    const input = { ...asset, response: { schema: constrained, schema_strict: true }, reasoning: { effort: 'high' as const }, sampling: { frequency_penalty: 1 } };
    const validation = bedrockAdapter.validate(input);
    expect(validation.warnings.join(' ')).toMatch(/minLength/);
    expect(validation.warnings.join(' ')).toMatch(/reasoning is model-specific/);
    expect(validation.warnings.join(' ')).toMatch(/frequency_penalty/);
    const request = bedrockAdapter.render(input, { variables: { name: 'Ada' } });
    expect(JSON.parse(request.body.outputConfig!.textFormat.structure.jsonSchema.schema)).toEqual(constrained);
    expect(validateAsset(input).warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'POK058' })]));
    expect(bedrockAdapter.validate({ ...asset, response: { schema: { type: 'object', properties: { minLength: { type: 'string' } } } } }).warnings).toEqual([]);
  });

  it('supports variable validation, compaction, and registry tools through the kit', async () => {
    const kit = createPromptOpsKit({ warnings: { contextSize: 'off' } });
    const source = `---\nid: reply\nprovider: bedrock\nmodel: ${model}\ncontext:\n  inputs:\n    - name: name\n      non_empty:\n        return_message: Name required\n  history:\n    max_items: 1\ntools: [lookup]\n---\n# Prompt template\nHello {{ name }}.`;
    const short = await kit.renderPrompt({ source, provider: 'bedrock', variables: { name: '' }, toolRegistry: { lookup: tool } });
    expect(short.returnMessage).toBe('Name required');
    const result = await kit.renderPrompt({ source, provider: 'bedrock', variables: { name: 'Ada' }, toolRegistry: { lookup: tool }, history: [
      { role: 'user', content: 'One' }, { role: 'assistant', content: 'Two' },
    ], onHistoryCompaction: () => 'Earlier context' });
    expect(result.request?.body.messages).toEqual([
      { role: 'user', content: [{ text: 'Earlier context' }] }, { role: 'user', content: [{ text: 'Hello Ada.' }] },
    ]);
    expect(result.request?.body.toolConfig).toBeDefined();
    const direct = await bedrockAdapter.renderPrompt({ source }, { variables: { name: '' } });
    expect(direct.returnMessage).toBe('Name required');
  });

  it('inherits Bedrock blocks and keeps source, compiled JSON, and direct rendering equivalent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pok-bedrock-'));
    dirs.push(root);
    const sourceDir = join(root, 'prompts');
    const compiledDir = join(root, 'compiled');
    await mkdir(sourceDir);
    await writeFile(join(sourceDir, 'defaults.md'), `---\nprovider: bedrock\nmodel: ${model}\ncache:\n  bedrock:\n    cache_system_instructions: true\n    ttl: 5m\nprovider_options:\n  bedrock:\n    request_metadata: {source: defaults}\nraw:\n  bedrock:\n    additionalModelResponseFieldPaths: [/stop_sequence]\n---\n# System instructions\nRoot policy.`);
    await writeFile(join(sourceDir, 'rules.md'), `---\nid: rules\n---\n# System instructions\nIncluded policy.`);
    await writeFile(join(sourceDir, 'reply.md'), `---\nid: reply\nincludes: [./rules.md]\nprovider_options:\n  bedrock:\n    service_tier: {type: default}\nenvironments:\n  prod:\n    cache:\n      bedrock: {ttl: 1h}\n    provider_options:\n      bedrock:\n        additional_model_request_fields: {top_k: 10}\n    raw:\n      bedrock:\n        requestMetadata: {environment: prod}\ntiers:\n  pro:\n    sampling: {max_output_tokens: 800}\n---\n# Prompt template\nHello {{ name }}.`);
    const opts = { provider: 'bedrock', environment: 'prod', tier: 'pro', runtime: { provider_options: { bedrock: { performance_config: { latency: 'standard' as const } } } }, variables: { name: 'Ada' } };
    const source = await createPromptOpsKit({ sourceDir, mode: 'source-only' }).renderPrompt({ path: 'reply', ...opts });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await compile([sourceDir, compiledDir]);
    const compiled = await createPromptOpsKit({ sourceDir, compiledDir, mode: 'compiled-only' }).renderPrompt({ path: 'reply', ...opts });
    const direct = await bedrockAdapter.renderPrompt({ path: 'reply', compiledDir, mode: 'compiled-only' }, opts);
    expect(compiled.request).toEqual(source.request);
    expect(direct.body).toEqual(source.request?.body);
    expect(direct.body).toMatchObject({ inferenceConfig: { maxTokens: 800 }, system: [
      { text: expect.stringContaining('Included policy.') }, { cachePoint: { type: 'default', ttl: '1h' } },
    ], additionalModelRequestFields: { top_k: 10 }, serviceTier: { type: 'default' }, performanceConfig: { latency: 'standard' }, requestMetadata: { environment: 'prod' }, additionalModelResponseFieldPaths: ['/stop_sequence'] });
    const compiledAsset = JSON.parse(await readFile(join(compiledDir, 'reply.json'), 'utf8')) as ResolvedPromptAsset;
    expect(bedrockAdapter.render(compiledAsset, opts).body).toEqual(direct.body);
    expect(compiledAsset.provider_options?.bedrock).toMatchObject({ request_metadata: { source: 'defaults' }, service_tier: { type: 'default' } });
    const esmDir = join(root, 'esm');
    await compile([sourceDir, esmDir, '--format', 'esm']);
    const esm = await import(pathToFileURL(join(esmDir, 'reply.mjs')).href);
    expect(bedrockAdapter.render(esm.default, opts).body).toEqual(direct.body);
  });

  it('resolves schema_ref before stringifying it and renders without AWS or HTTP access', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pok-bedrock-schema-'));
    dirs.push(root);
    await writeFile(join(root, 'reply.schema.json'), JSON.stringify(schema));
    await writeFile(join(root, 'reply.md'), `---\nid: reply\nprovider: bedrock\nmodel: ${model}\nresponse:\n  format: json\n  schema_ref: ./reply.schema.json\n---\n# Prompt template\nHello`);
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network must not be used'));
    const request = await bedrockAdapter.renderPrompt({ path: 'reply', sourceDir: root, mode: 'source-only' }, {});
    expect(request.body?.outputConfig?.textFormat.structure.jsonSchema.schema).toBe(JSON.stringify(schema));
    expect(network).not.toHaveBeenCalled();
  });

  it.each([ConverseCommand, ConverseStreamCommand])('serializes with the real AWS command without network access (%s)', async (Command) => {
    const request = bedrockAdapter.render({ ...asset, tools: [tool], response: { schema }, cache: { bedrock: { cache_tools: true } } }, { variables: { name: 'Ada' } });
    const capture = vi.fn(async (_request: unknown) => { throw new Error('captured before network'); });
    const client = new BedrockRuntimeClient({
      region: 'us-east-1', credentials: { accessKeyId: 'test', secretAccessKey: 'test' }, maxAttempts: 1,
      requestHandler: { handle: capture },
    });
    try {
      await expect(client.send(new Command(request.body))).rejects.toThrow('captured before network');
      const http = capture.mock.calls[0][0] as { path: string; body: string };
      expect(http.path).toContain(encodeURIComponent(model));
      expect(http.path.endsWith(Command === ConverseStreamCommand ? '/converse-stream' : '/converse')).toBe(true);
      const payload = JSON.parse(http.body);
      expect(payload).toMatchObject({ inferenceConfig: { maxTokens: 4096 }, messages: request.body.messages, toolConfig: request.body.toolConfig, outputConfig: request.body.outputConfig });
      expect(payload).not.toHaveProperty('modelId');
      expect(payload).not.toHaveProperty('operation');
    } finally { client.destroy(); }
  });
});
