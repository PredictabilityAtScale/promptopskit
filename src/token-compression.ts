import { tryJsonToToon } from './toon-encoding.js';

const TOKEN_REGEX = /[\p{L}\p{N}]+|[^\s]/gu;
const TOKEN_NORMALIZE_REGEX = /[^\p{L}\p{N}]/gu;
const DEDUPE_NORMALIZE_REGEX = /[^\p{L}\p{N}\s]/gu;
const BOILERPLATE_REGEX = /copyright|all rights reserved|disclaimer/i;
const STRUCTURED_BLOCK_REGEX = /(^|\n)\s*```|(^|\n)\s*\|.+\|\s*(\n|$)/;
const PROTECTED_SIGNAL_REGEX = /\b(?:must|shall|should|required|requires|requirement|never|do not|don't|only|except|unless|however|but|constraint|constraints|safety|security|deadline|sla)\b|output\s+format/i;
const EVIDENCE_SIGNAL_REGEX = /https?:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|[$€£]\s?\d|\b\d+(?:[.,:/-]\d+)*%?\b|\b[A-Z]{2,}[-_A-Z0-9]*\b|\b[A-Z]\d\b/i;
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
  mode?: 'conservative' | 'balanced';
  preserve_neighbors?: boolean;
  fail_on_low_confidence?: boolean;
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
  isProtected: boolean;
  hasEvidence: boolean;
}

interface ScoredSentenceCandidate {
  sentence: string;
  index: number;
  score: number;
  overlapCount: number;
  overlapTerms: string[];
  tokens: number;
  isProtected: boolean;
  hasEvidence: boolean;
}

const DEFAULT_OPTIONS = {
  min_tokens: 80,
  max_sentences: 10,
  target_reduction: 0.45,
  mode: 'conservative' as const,
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

  if (inputTokens === 0) {
    return toCompressionOutput(inputText, inputTokens);
  }

  const mode = options.mode ?? DEFAULT_OPTIONS.mode;
  const isConservative = mode === 'conservative';
  const failOnLowConfidence = options.fail_on_low_confidence ?? isConservative;
  const preserveNeighbors = options.preserve_neighbors ?? isConservative;

  const minTokens = options.min_tokens ?? DEFAULT_OPTIONS.min_tokens;
  if (inputTokens <= minTokens) {
    return toCompressionOutput(inputText, inputTokens);
  }

  if (isConservative && looksStructured(inputText)) {
    return toCompressionOutput(inputText, inputTokens, [
      'Heuristic compression skipped because the input appears to contain structured blocks; use TOON or code compaction for structured content.',
    ]);
  }

  const analysis = preprocessContext(inputText);

  const targetReduction = options.target_reduction ?? DEFAULT_OPTIONS.target_reduction;
  const targetTokens = Math.max(1, Math.max(minTokens, Math.floor(inputTokens * (1 - targetReduction))));
  const maxSentences = options.max_sentences ?? DEFAULT_OPTIONS.max_sentences;
  const query = options.query ?? '';
  const terms = queryTerms(query);

  if (failOnLowConfidence && terms.size === 0) {
    return toCompressionOutput(inputText, inputTokens, [
      'Heuristic compression skipped because no usable relevance query terms were available.',
    ]);
  }

  const scoredSentences = analysis.candidates.map((candidate) => ({
    sentence: candidate.sentence,
    index: candidate.index,
    ...scoreSentenceCandidate(candidate, terms),
    tokens: candidate.tokenCount,
    isProtected: candidate.isProtected,
    hasEvidence: candidate.hasEvidence,
  }));

  if (
    failOnLowConfidence
    && terms.size > 0
    && !scoredSentences.some((candidate) => candidate.overlapCount > 0)
  ) {
    return toCompressionOutput(inputText, inputTokens, [
      'Heuristic compression skipped because no sentence matched the relevance query.',
    ]);
  }

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

  const finalSelection = preserveNeighbors
    ? expandSelectionWithNeighbors(selected, scoredSentences, maxSentences)
    : selected;

  finalSelection.sort((left, right) => left.index - right.index);

  let output = finalSelection.map((item) => item.sentence).join(' ');

  if (!output) {
    output = takeWholeCandidatesWithinBudget(analysis.candidates, targetTokens) || inputText;
  }

  return toCompressionOutput(output, inputTokens);
}

function toCompressionOutput(
  output: string,
  inputTokens: number,
  warnings: string[] = [],
): HeuristicCompressionOutput {
  const outputTokens = estimateHeuristicTokens(output);
  const tokensSaved = Math.max(0, inputTokens - outputTokens);

  return {
    output,
    inputTokens,
    outputTokens,
    tokensSaved,
    compressionRatio: outputTokens === 0 ? 0 : inputTokens / outputTokens,
    ...(warnings.length > 0 ? { warnings } : {}),
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
      return [segment];
    });
  }

  return [sentence];
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
  return new Set(tokenizeNormalized(query).filter((term) => {
    if (STOP_WORDS.has(term)) {
      return false;
    }
    return term.length >= 3 || /^(?:[a-z]\d|\d+[a-z]?|[a-z]{2})$/i.test(term);
  }));
}

function preprocessContext(context: string): { originalTokens: number; candidates: SentenceCandidate[] } {
  const originalTokens = estimateHeuristicTokens(context);
  const candidates: SentenceCandidate[] = [];
  let previousNormalized = '';

  for (const sentence of splitIntoSentences(context)) {
    for (const segment of splitOversizedSentence(sentence)) {
      const normalized = normalizeForDeduping(segment);
      if (!normalized || normalized === previousNormalized) {
        continue;
      }

      previousNormalized = normalized;

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
        isProtected: PROTECTED_SIGNAL_REGEX.test(segment),
        hasEvidence: EVIDENCE_SIGNAL_REGEX.test(segment),
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
  const protectedScore = candidate.isProtected ? 0.9 : 0;
  const evidenceScore = candidate.hasEvidence ? 0.4 : 0;

  return {
    score: overlapScore + densityScore + lengthScore + protectedScore + evidenceScore - boilerplatePenalty,
    overlapCount: overlap,
    overlapTerms,
  };
}

function looksStructured(text: string): boolean {
  if (STRUCTURED_BLOCK_REGEX.test(text)) {
    return true;
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) {
    return false;
  }

  const listLikeLines = lines.filter((line) => /^[-*+] |\d+[.)] /.test(line)).length;
  return listLikeLines >= 3 && listLikeLines / lines.length >= 0.6;
}

function expandSelectionWithNeighbors(
  selected: ScoredSentenceCandidate[],
  scoredSentences: ScoredSentenceCandidate[],
  maxSentences: number,
): ScoredSentenceCandidate[] {
  if (selected.length === 0 || selected.length >= maxSentences) {
    return selected;
  }

  const byIndex = new Map(scoredSentences.map((candidate) => [candidate.index, candidate]));
  const expanded = new Map(selected.map((candidate) => [candidate.index, candidate]));

  for (const candidate of selected) {
    if (expanded.size >= maxSentences) {
      break;
    }

    if (candidate.overlapCount === 0 && !candidate.isProtected && !candidate.hasEvidence) {
      continue;
    }

    for (const neighborIndex of [candidate.index - 1, candidate.index + 1]) {
      if (expanded.size >= maxSentences) {
        break;
      }

      const neighbor = byIndex.get(neighborIndex);
      if (neighbor && !expanded.has(neighbor.index)) {
        expanded.set(neighbor.index, neighbor);
      }
    }
  }

  return [...expanded.values()];
}

function takeWholeCandidatesWithinBudget(candidates: SentenceCandidate[], targetTokens: number): string {
  const selected: string[] = [];
  let tokens = 0;

  for (const candidate of candidates) {
    if (tokens + candidate.tokenCount > targetTokens) {
      break;
    }

    selected.push(candidate.sentence);
    tokens += candidate.tokenCount;
  }

  return selected.join(' ');
}
