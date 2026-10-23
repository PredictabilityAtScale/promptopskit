# Bedrock customer-pilot review

Date: 2026-10-23. Reviewed the uncommitted native adapter, shared rendering/type changes, schemas and inheritance, SDK handoff, packaging, documentation, and dependency audit. No release or live AWS invocation was performed.

## Findings fixed

1. **Silent loss of native tool-call history.** Structurally compatible assistant messages could contain `tool_calls` alongside text. The renderer projected them to text and discarded the tool protocol. Text history now accepts exactly `role` and `content`; unsupported native fields are rejected. Custom history-compaction output is checked before projection too. Regression tests reproduced both failures before the fix.
2. **Invalid tool root schemas reached the SDK.** String/array/number root schemas rendered successfully even though Bedrock requires an object root. All tool paths, including final raw input validation, now require `type: object`. Added regression cases. See [AWS ToolInputSchema](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolInputSchema.html).
3. **Pre-existing YAML parser vulnerability.** The baseline lockfile resolved `gray-matter`'s `js-yaml` dependency to 3.14.2. Updated it to the compatible patched 3.15.2 release. The reported attacks consume excessive CPU when parsing attacker-controlled YAML. Added an anchor/merge compatibility test, and the production dependency audit now reports zero vulnerabilities. See [upstream advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh). This is a lockfile update; downstream applications should verify their own resolved dependency tree.

## Verification

- `npm run lint`: passed, including structural compatibility with real AWS Converse/ConverseStream input types.
- `npm test`: 317 passed across 16 files, including the other providers and existing lifecycle tests.
- `npm run build`: passed for ESM, CommonJS, and declarations.
- `npm run attw`: passed for all exports, including `promptopskit/bedrock`.
- `publint`: no errors; one optional existing tree-shaking suggestion about the missing `sideEffects` field.
- Package preview includes all four Bedrock runtime/type entry files and excludes tests, node_modules, and environment files.
- No AWS SDK imports appear in public declaration files. The SDK remains a development-only dependency.
- Real SDK serialization tests use a local handler and dummy credentials; they do not call AWS.
- `npm audit --omit=dev`: zero findings after the YAML update.
- Full dependency audit still reports 11 development-tool findings (5 high, 5 moderate, 1 low). These are outside the production dependency tree and remain maintenance work; this review does not claim a clean development-tool audit.

## Pilot recommendation and limits

The local checks found no remaining blocker to a bounded customer smoke test. This does not establish live model availability, IAM permissions, quota, latency, or every model's schema/cache/tool support.

Use the customer's approved model/profile and region. Start with text-only buffered and streamed calls and an explicit small output limit, for example 256 tokens. Leave external compression disabled for this baseline. Then test only the tool, structured-output, and cache features the customer actually needs. Credentials, retries, transport, response handling, and billing remain in the customer's application.

Prompt assets and raw overrides are trusted configuration, not a security-policy boundary for untrusted callers. Tool loops and multimodal/native tool history are outside this adapter's supported history interface. UsageTap metering has not been added.

The package is still uncommitted and unpublished at version 0.11.0. See the [Bedrock guide](../bedrock.md) for integration examples.
