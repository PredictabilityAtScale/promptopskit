import { tryJsonToToon } from './toon-encoding.js';

const TOKEN_REGEX = /[\p{L}\p{N}]+|[^\s]/gu;
const TOKEN_NORMALIZE_REGEX = /[^\p{L}\p{N}]/gu;
const DEDUPE_NORMALIZE_REGEX = /[^\p{L}\p{N}\s]/gu;
const BOILERPLATE_REGEX = /copyright|all rights reserved|disclaimer|confidential/i;
const MAX_SEGMENT_TOKENS = 120;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'we', 'with', 'you', 'your', 'our',
]);

export interface HeuristicCompressionOptions {
  min_tokens?: number;
  max_sentences?: number;
  target_reduction?: number;
  query?: string;
  json_to_toon?: boolean;
}

export interface HeuristicCompressionOutput {
  output: string;
  inputTokens: number;
  outputTokens: number;
  tokensSaved: number;
  compressionRatio: number;
  outputFormat?: 'toon';
  warnings?: string[];
}

interface SentenceCandidate {
  sentence: string;
  index: number;
  tokenCount: number;
  uniqueTerms: Set<string>;
  isBoilerplate: boolean;
}

interface ScoredSentenceCandidate {
  sentence: string;
  index: number;
  score: number;
  overlapCount: number;
  overlapTerms: string[];
  tokens: number;
}

const DEFAULT_OPTIONS = {
  min_tokens: 80,
  max_sentences: 10,
  target_reduction: 0.45,
};

export function tokenizeForHeuristicCompression(text: string | undefined): string[] {
  if (!text) {
    return [];
  }

  return text.match(TOKEN_REGEX) ?? [];
}

export function estimateHeuristicTokens(text: string | undefined): number {
  return tokenizeForHeuristicCompression(text).length;
}

export function compressHeuristicText(
  input: string,
  options: HeuristicCompressionOptions = {},
): HeuristicCompressionOutput {
  const inputText = input ?? '';
  const inputTokens = estimateHeuristicTokens(inputText);

  if (options.json_to_toon === true) {
    const toonResult = tryJsonToToon(inputText);
    if (toonResult) {
      const toonOutputTokens = estimateHeuristicTokens(toonResult.output);
      if (toonOutputTokens <= inputTokens) {
        return {
          ...toCompressionOutput(toonResult.output, inputTokens),
          outputFormat: 'toon',
        };
      }

      return {
        ...toCompressionOutput(inputText, inputTokens),
        warnings: ['JSON-to-TOON skipped because TOON was not smaller than the original JSON.'],
      };
    }

    return {
      ...toCompressionOutput(inputText, inputTokens),
      warnings: ['JSON-to-TOON skipped because the input is not a complete valid JSON object or array.'],
    };
  }

  const analysis = preprocessContext(inputText);

  if (inputTokens === 0) {
    return toCompressionOutput(inputText, inputTokens);
  }

  const minTokens = options.min_tokens ?? DEFAULT_OPTIONS.min_tokens;
  if (inputTokens <= minTokens) {
    return toCompressionOutput(inputText, inputTokens);
  }

  const targetReduction = options.target_reduction ?? DEFAULT_OPTIONS.target_reduction;
  const targetTokens = Math.max(1, Math.max(minTokens, Math.floor(inputTokens * (1 - targetReduction))));
  const maxSentences = options.max_sentences ?? DEFAULT_OPTIONS.max_sentences;
  const query = options.query ?? '';
  const terms = queryTerms(query);

  const scoredSentences = analysis.candidates.map((candidate) => ({
    sentence: candidate.sentence,
    index: candidate.index,
    ...scoreSentenceCandidate(candidate, terms),
    tokens: candidate.tokenCount,
  }));

  const selected: ScoredSentenceCandidate[] = [];
  const selectedIndices = new Set<number>();
  const coveredTerms = new Set<string>();
  let selectedTokens = 0;

  while (selected.length < maxSentences) {
    let bestCandidate: ScoredSentenceCandidate | undefined;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;

    for (const candidate of scoredSentences) {
      if (selectedIndices.has(candidate.index)) {
        continue;
      }

      const underBudget = selectedTokens + candidate.tokens <= targetTokens;
      const forceTopCandidate = selected.length === 0;
      const forceRelevantSecond = selected.length === 1 && candidate.overlapCount > 0;

      if (!underBudget && !forceTopCandidate && !forceRelevantSecond) {
        continue;
      }

      let uncoveredOverlapCount = 0;
      for (const term of candidate.overlapTerms) {
        if (!coveredTerms.has(term)) {
          uncoveredOverlapCount += 1;
        }
      }

      const adjustedScore = candidate.score + uncoveredOverlapCount * 1.2;

      if (
        adjustedScore > bestAdjustedScore
        || (
          adjustedScore === bestAdjustedScore
          && bestCandidate
          && isBetterTieBreak(candidate, bestCandidate)
        )
      ) {
        bestAdjustedScore = adjustedScore;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) {
      break;
    }

    selected.push(bestCandidate);
    selectedIndices.add(bestCandidate.index);
    selectedTokens += bestCandidate.tokens;

    for (const term of bestCandidate.overlapTerms) {
      coveredTerms.add(term);
    }
  }

  selected.sort((left, right) => left.index - right.index);

  let output = selected.map((item) => item.sentence).join(' ');

  if (!output) {
    output = tokenizeForHeuristicCompression(inputText).slice(0, targetTokens).join(' ');
  } else {
    const outputTokens = tokenizeForHeuristicCompression(output);
    if (outputTokens.length > targetTokens) {
      output = outputTokens.slice(0, targetTokens).join(' ');
    }
  }

  return toCompressionOutput(output, inputTokens);
}

function toCompressionOutput(output: string, inputTokens: number): HeuristicCompressionOutput {
  const outputTokens = estimateHeuristicTokens(output);
  const tokensSaved = Math.max(0, inputTokens - outputTokens);

  return {
    output,
    inputTokens,
    outputTokens,
    tokensSaved,
    compressionRatio: outputTokens === 0 ? 0 : inputTokens / outputTokens,
  };
}

function isBetterTieBreak(
  candidate: ScoredSentenceCandidate,
  bestCandidate: ScoredSentenceCandidate,
): boolean {
  if (candidate.overlapCount !== bestCandidate.overlapCount) {
    return candidate.overlapCount > bestCandidate.overlapCount;
  }
  if (candidate.tokens !== bestCandidate.tokens) {
    return candidate.tokens < bestCandidate.tokens;
  }
  return candidate.index < bestCandidate.index;
}

function normalizeForDeduping(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(DEDUPE_NORMALIZE_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function chunkTokens(tokens: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < tokens.length; index += chunkSize) {
    chunks.push(tokens.slice(index, index + chunkSize));
  }
  return chunks;
}

function splitOversizedSentence(sentence: string, maxTokens = MAX_SEGMENT_TOKENS): string[] {
  const rawTokens = tokenizeForHeuristicCompression(sentence);
  if (rawTokens.length <= maxTokens) {
    return [sentence];
  }

  const commaSplit = sentence
    .split(/(?<=[,;:])\s+|\s+-\s+/g)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (commaSplit.length > 1) {
    return commaSplit.flatMap((segment) => {
      if (estimateHeuristicTokens(segment) <= maxTokens) {
        return [segment];
      }
      return chunkTokens(tokenizeForHeuristicCompression(segment), maxTokens).map((chunk) => chunk.join(' '));
    });
  }

  return chunkTokens(rawTokens, maxTokens).map((chunk) => chunk.join(' '));
}

function normalizeToken(token: string): string {
  return token.replace(TOKEN_NORMALIZE_REGEX, '').trim();
}

function tokenizeNormalized(text: string): string[] {
  return tokenizeForHeuristicCompression(text.toLowerCase())
    .map(normalizeToken)
    .filter(Boolean);
}

function queryTerms(query: string): Set<string> {
  return new Set(tokenizeNormalized(query).filter((term) => term.length >= 3 && !STOP_WORDS.has(term)));
}

function preprocessContext(context: string): { originalTokens: number; candidates: SentenceCandidate[] } {
  const originalTokens = estimateHeuristicTokens(context);
  const dedupeSet = new Set<string>();
  const candidates: SentenceCandidate[] = [];

  for (const sentence of splitIntoSentences(context)) {
    for (const segment of splitOversizedSentence(sentence)) {
      const normalized = normalizeForDeduping(segment);
      if (!normalized || dedupeSet.has(normalized)) {
        continue;
      }

      dedupeSet.add(normalized);

      const rawTokens = tokenizeForHeuristicCompression(segment);
      const normalizedTerms = rawTokens
        .map((token) => normalizeToken(token.toLowerCase()))
        .filter(Boolean);
      const lowered = segment.toLowerCase();

      candidates.push({
        sentence: segment,
        index: candidates.length,
        tokenCount: rawTokens.length,
        uniqueTerms: new Set(normalizedTerms),
        isBoilerplate: BOILERPLATE_REGEX.test(lowered),
      });
    }
  }

  return { originalTokens, candidates };
}

function scoreSentenceCandidate(
  candidate: SentenceCandidate,
  terms: Set<string>,
): { score: number; overlapCount: number; overlapTerms: string[] } {
  if (candidate.tokenCount === 0) {
    return {
      score: 0,
      overlapCount: 0,
      overlapTerms: [],
    };
  }

  const overlapTerms: string[] = [];
  let overlap = 0;

  for (const term of terms) {
    if (candidate.uniqueTerms.has(term)) {
      overlap += 1;
      overlapTerms.push(term);
    }
  }

  const overlapScore = overlap * 2;
  const densityScore = terms.size > 0 ? overlap / terms.size : 0;
  const lengthScore = Math.min(candidate.tokenCount, 40) / 40;
  const boilerplatePenalty = candidate.isBoilerplate ? 0.5 : 0;

  return {
    score: overlapScore + densityScore + lengthScore - boilerplatePenalty,
    overlapCount: overlap,
    overlapTerms,
  };
}
