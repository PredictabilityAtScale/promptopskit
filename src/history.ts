import type { ResolvedPromptAsset } from './schema/index.js';
import type {
  RuntimeHistoryCompactionInfo,
  RuntimeHistoryMessage,
  RuntimeRenderOptions,
} from './providers/types.js';

function defaultCompactHistory(info: RuntimeHistoryCompactionInfo): RuntimeHistoryMessage {
  const content = info.overflow
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n\n');

  return {
    role: 'user',
    content: `Earlier conversation compacted to preserve history:\n\n${content}`,
  };
}

function normalizeCompactionResult(result: ReturnType<NonNullable<RuntimeRenderOptions['onHistoryCompaction']>>): RuntimeHistoryMessage {
  if (typeof result === 'string') {
    return {
      role: 'user',
      content: result,
    };
  }

  return result;
}

export function compactHistoryForPrompt(
  asset: Pick<ResolvedPromptAsset, 'id' | 'context'>,
  runtime: Pick<RuntimeRenderOptions, 'history' | 'onHistoryCompaction'>,
): RuntimeHistoryMessage[] | undefined {
  const history = runtime.history;
  const maxItems = asset.context?.history?.max_items;

  if (!history || maxItems === undefined || history.length <= maxItems) {
    return history;
  }

  if (maxItems === 1) {
    const info = {
      promptId: asset.id,
      maxItems,
      overflow: history,
      preserved: [],
      history,
    };
    const compacted = runtime.onHistoryCompaction
      ? normalizeCompactionResult(runtime.onHistoryCompaction(info))
      : defaultCompactHistory(info);
    return [compacted];
  }

  const preservedCount = maxItems - 1;
  const overflow = history.slice(0, history.length - preservedCount);
  const preserved = history.slice(-preservedCount);
  const info = {
    promptId: asset.id,
    maxItems,
    overflow,
    preserved,
    history,
  };
  const compacted = runtime.onHistoryCompaction
    ? normalizeCompactionResult(runtime.onHistoryCompaction(info))
    : defaultCompactHistory(info);

  return [compacted, ...preserved];
}
