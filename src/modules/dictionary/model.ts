export interface DictionaryPronunciation {
  type: string;
  text: string;
  tags: string[];
}

export interface DictionarySenseCandidate {
  id: string;
  entryIndex: number;
  partOfSpeech: string;
  depth: number;
  parentDefinition?: string;
  definition: string;
  tags: string[];
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  pronunciations: DictionaryPronunciation[];
}

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "unknown";
export type VocabularyFieldSource = "dictionary" | "ai" | "none";

/** A learner-facing meaning normalized from one API sense. */
export interface VocabularySense {
  id: string;
  word: string;
  partOfSpeech: string;
  pronunciation: string;
  meaningEn: string;
  meaningVi: string;
  example: string;
  cefrLevel: CEFRLevel;
  cefrEstimated: true;
  definitionOriginal: string;
  partOfSpeechSource: VocabularyFieldSource;
  pronunciationSource: VocabularyFieldSource;
  exampleSource: VocabularyFieldSource;
  synonyms: string[];
  antonyms: string[];
  tags: string[];
}

export interface VocabularyLookup {
  word: string;
  language: string;
  sourceUrl: string;
  sourceLicense: string;
  llmService?: string;
  normalizationVersion?: number;
  llmError?: string;
  normalizationStatus: "raw" | "normalized" | "error";
  /** Ranked candidates. New lookups contain at most five. */
  senses: VocabularySense[];
}

interface ApiSense {
  definition?: unknown;
  tags?: unknown;
  examples?: unknown;
  synonyms?: unknown;
  antonyms?: unknown;
  subsenses?: unknown;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function stableSenseId(
  partOfSpeech: string,
  definition: string,
  parentDefinition?: string,
) {
  const value =
    `${partOfSpeech}\u0000${parentDefinition || ""}\u0000${definition}`
      .normalize("NFKC")
      .toLocaleLowerCase();
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `sense-${(hash >>> 0).toString(36)}`;
}

export function flattenDictionaryEntries(
  payload: any,
): DictionarySenseCandidate[] {
  const candidates: DictionarySenseCandidate[] = [];
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];

  entries.forEach((entry: any, entryIndex: number) => {
    const partOfSpeech =
      typeof entry?.partOfSpeech === "string" ? entry.partOfSpeech : "unknown";
    const pronunciations: DictionaryPronunciation[] = Array.isArray(
      entry?.pronunciations,
    )
      ? entry.pronunciations
          .filter((item: any) => typeof item?.text === "string")
          .map((item: any) => ({
            type: typeof item.type === "string" ? item.type : "",
            text: item.text.trim(),
            tags: strings(item.tags),
          }))
      : [];
    const entrySynonyms = strings(entry?.synonyms);
    const entryAntonyms = strings(entry?.antonyms);
    const usedIds = new Map<string, number>();

    const visit = (
      rawSenses: unknown,
      depth: number,
      parentDefinition?: string,
    ) => {
      if (!Array.isArray(rawSenses)) return;
      rawSenses.forEach((rawSense) => {
        const sense = (rawSense || {}) as ApiSense;
        const definition =
          typeof sense.definition === "string" ? sense.definition.trim() : "";
        if (!definition) return;
        const baseId = stableSenseId(
          partOfSpeech,
          definition,
          parentDefinition,
        );
        const duplicateNumber = usedIds.get(baseId) || 0;
        usedIds.set(baseId, duplicateNumber + 1);
        candidates.push({
          id: duplicateNumber ? `${baseId}-${duplicateNumber + 1}` : baseId,
          entryIndex,
          partOfSpeech,
          depth,
          parentDefinition,
          definition,
          tags: strings(sense.tags),
          examples: strings(sense.examples),
          synonyms: [
            ...new Set([...strings(sense.synonyms), ...entrySynonyms]),
          ],
          antonyms: [
            ...new Set([...strings(sense.antonyms), ...entryAntonyms]),
          ],
          pronunciations,
        });
        visit(sense.subsenses, depth + 1, definition);
      });
    };

    visit(entry?.senses, 0);
  });

  return candidates;
}

const RARE_TAG =
  /^(archaic|obsolete|historical|rare|dated|poetic|dialectal|chiefly historical)$/i;

export function buildMeaningCandidatePool(
  candidates: DictionarySenseCandidate[],
  max = 60,
) {
  return candidates
    .filter((sense) => !sense.tags.some((tag) => RARE_TAG.test(tag)))
    .slice(0, max);
}

function bestPronunciation(sense: DictionarySenseCandidate) {
  const ipa = sense.pronunciations.find(
    (item) => item.type === "ipa" && /^\/.+\/$/.test(item.text),
  );
  return (ipa || sense.pronunciations[0])?.text || "";
}

export function candidateToVocabularySense(
  word: string,
  sense: DictionarySenseCandidate,
): VocabularySense {
  const pronunciation = bestPronunciation(sense);
  const example = sense.examples[0] || "";
  return {
    id: sense.id,
    word,
    partOfSpeech: sense.partOfSpeech,
    pronunciation,
    meaningEn: sense.definition,
    meaningVi: "",
    example,
    cefrLevel: "unknown",
    cefrEstimated: true,
    definitionOriginal: sense.definition,
    partOfSpeechSource:
      sense.partOfSpeech === "unknown" ? "none" : "dictionary",
    pronunciationSource: pronunciation ? "dictionary" : "none",
    exampleSource: example ? "dictionary" : "none",
    synonyms: sense.synonyms,
    antonyms: sense.antonyms,
    tags: sense.tags,
  };
}

export function fallbackVocabularySenses(
  word: string,
  candidates: DictionarySenseCandidate[],
  max = 5,
): VocabularySense[] {
  return buildMeaningCandidatePool(candidates)
    .slice(0, max)
    .map((sense) => candidateToVocabularySense(word, sense));
}

export function formatVocabularyLookup(lookup: VocabularyLookup) {
  const lines = [lookup.word];
  lookup.senses.forEach((sense, index) => {
    const level = sense.cefrLevel === "unknown" ? "" : ` · ~${sense.cefrLevel}`;
    lines.push(
      `${index + 1}. [${sense.partOfSpeech}]${level}${
        sense.pronunciation ? ` ${sense.pronunciation}` : ""
      }`,
      `EN: ${sense.meaningEn}`,
    );
    if (sense.meaningVi) lines.push(`VI: ${sense.meaningVi}`);
    if (sense.example) lines.push(`Example: ${sense.example}`);
  });
  if (lookup.llmError) lines.push(`LLM: ${lookup.llmError}`);
  lines.push(`Source: ${lookup.sourceUrl}`);
  return lines.join("\n");
}
