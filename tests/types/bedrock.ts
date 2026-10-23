import { ConverseCommand, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ConverseCommandInput, ConverseStreamCommandInput } from '@aws-sdk/client-bedrock-runtime';
import { bedrockAdapter } from '../../src/providers/bedrock.js';
import type { BedrockConverseInput } from '../../src/providers/bedrock.js';
import type { ResolvedPromptAsset } from '../../src/schema/index.js';

// Compilation verifies the complete structural input without AWS types in public declarations.
export async function sdkHandoff(asset: ResolvedPromptAsset, input: BedrockConverseInput) {
  const buffered: ConverseCommandInput = input;
  const streaming: ConverseStreamCommandInput = input;
  new ConverseCommand(buffered);
  new ConverseStreamCommand(streaming);
  new ConverseCommand(bedrockAdapter.render(asset, {}).body);
  const rendered = await bedrockAdapter.renderPrompt(asset, {});
  if (rendered.body) new ConverseStreamCommand(rendered.body);
}
