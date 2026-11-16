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

export interface VocabularySense {
  id: string;
  partOfSpeech: string;
  pronunciation: string;
  definitionOriginal: string;
  definitionEn: string;
  definitionVi: string;
  exampleEn: string;
  exampleVi: string;
  exampleSource: "dictionary" | "ai" | "none";
  synonyms: string[];
  antonyms: string[];
  tags: string[];
  reason: "daily" | "academic-cs" | "fallback";
}

export interface VocabularyLookup {
  word: string;
  language: string;
  sourceUrl: string;
  sourceLicense: string;
  llmService?: string;
  llmError?: string;
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
            text: item.text,
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
        const id = duplicateNumber
          ? `${baseId}-${duplicateNumber + 1}`
          : baseId;
        candidates.push({
          id,
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

const ACADEMIC_CS =
  /\b(comput|software|hardware|program|algorithm|data|database|network|internet|memory|processor|system|function|variable|object|class|method|interface|server|client|machine|digital|logic|mathemat|science|research|academic|statistic|model|theory)\b/i;
const RARE_TAG =
  /^(archaic|obsolete|historical|rare|dated|poetic|dialectal|chiefly historical)$/i;

export function buildMeaningCandidatePool(
  candidates: DictionarySenseCandidate[],
  max = 60,
) {
  const ordinary = candidates.filter(
    (sense) => !sense.tags.some((tag) => RARE_TAG.test(tag)),
  );
  const daily = ordinary.slice(0, 30);
  const academic = ordinary.filter((sense) =>
    ACADEMIC_CS.test(
      `${sense.definition} ${sense.parentDefinition || ""} ${sense.tags.join(" ")}`,
    ),
  );
  const result = new Map<string, DictionarySenseCandidate>();
  for (const sense of [...daily, ...academic, ...ordinary]) {
    if (result.size >= max) break;
    result.set(sense.id, sense);
  }
  return [...result.values()];
}

function bestPronunciation(sense: DictionarySenseCandidate) {
  const ipa = sense.pronunciations.find(
    (item) => item.type === "ipa" && /^\/.+\/$/.test(item.text),
  );
  return (ipa || sense.pronunciations[0])?.text || "";
}

export function candidateToVocabularySense(
  sense: DictionarySenseCandidate,
  reason: VocabularySense["reason"] = "fallback",
): VocabularySense {
  return {
    id: sense.id,
    partOfSpeech: sense.partOfSpeech,
    pronunciation: bestPronunciation(sense),
    definitionOriginal: sense.definition,
    definitionEn: sense.definition,
    definitionVi: "",
    exampleEn: sense.examples[0] || "",
    exampleVi: "",
    exampleSource: sense.examples[0] ? "dictionary" : "none",
    synonyms: sense.synonyms,
    antonyms: sense.antonyms,
    tags: sense.tags,
    reason,
  };
}

export function fallbackVocabularySenses(
  candidates: DictionarySenseCandidate[],
): VocabularySense[] {
  const pool = buildMeaningCandidatePool(candidates);
  const daily = pool[0];
  const academic = pool.find(
    (sense) =>
      sense.id !== daily?.id &&
      ACADEMIC_CS.test(
        `${sense.definition} ${sense.parentDefinition || ""} ${sense.tags.join(" ")}`,
      ),
  );
  const selected = [
    daily,
    academic || pool.find((sense) => sense.id !== daily?.id),
  ]
    .filter((sense): sense is DictionarySenseCandidate => Boolean(sense))
    .slice(0, 2);

  return selected.map((sense, index) =>
    candidateToVocabularySense(
      sense,
      index === 0 ? "daily" : academic ? "academic-cs" : "fallback",
    ),
  );
}

export function formatVocabularyLookup(lookup: VocabularyLookup) {
  const lines = [`${lookup.word}`];
  lookup.senses.forEach((sense, index) => {
    const heading = `${index + 1}. [${sense.partOfSpeech}]${
      sense.pronunciation ? ` ${sense.pronunciation}` : ""
    }`;
    lines.push(heading, `EN: ${sense.definitionEn}`);
    if (sense.definitionVi) lines.push(`VI: ${sense.definitionVi}`);
    if (sense.exampleEn) lines.push(`Example: ${sense.exampleEn}`);
    if (sense.exampleVi) lines.push(`Ví dụ: ${sense.exampleVi}`);
    if (sense.synonyms.length)
      lines.push(`Synonyms: ${sense.synonyms.join(", ")}`);
    if (sense.antonyms.length)
      lines.push(`Antonyms: ${sense.antonyms.join(", ")}`);
  });
  if (lookup.llmError) {
    lines.push(`LLM: ${lookup.llmError}`);
  }
  lines.push(`Source: ${lookup.sourceUrl}`);
  return lines.join("\n");
}
