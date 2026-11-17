import { getPref, TranslateTask, TranslateTaskRunner } from "../../utils";
import {
  buildMeaningCandidatePool,
  candidateToVocabularySense,
  CEFRLevel,
  fallbackVocabularySenses,
  flattenDictionaryEntries,
  formatVocabularyLookup,
  VocabularyLookup,
  VocabularySense,
} from "../dictionary/model";
import { TranslateService } from "./base";

type VocabularyTask = TranslateTask & { vocabularyLookup?: VocabularyLookup };
export const VOCABULARY_NORMALIZATION_VERSION = 2;

const CEFR_LEVELS = new Set<CEFRLevel>([
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
  "unknown",
]);

export function parseVocabularyJSON(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = (fenced || text).trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM did not return JSON.");
  return JSON.parse(source.slice(start, end + 1));
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`LLM JSON has an empty ${field}.`);
  }
  return value.trim();
}

function sameWord(left: string, right: string) {
  return (
    left.normalize("NFKC").trim().toLocaleLowerCase() ===
    right.normalize("NFKC").trim().toLocaleLowerCase()
  );
}

export function normalizeVocabularyResponse(
  word: string,
  parsed: any,
  candidates: ReturnType<typeof flattenDictionaryEntries>,
) {
  if (!Array.isArray(parsed?.senses)) {
    throw new Error("LLM JSON is missing the senses array.");
  }
  const pool = buildMeaningCandidatePool(candidates);
  const byId = new Map(pool.map((sense) => [sense.id, sense]));
  const seen = new Set<string>();
  const normalized: VocabularySense[] = [];

  for (const raw of parsed.senses) {
    if (normalized.length >= 5) break;
    const id = requiredString(raw?.sourceSenseId ?? raw?.id, "sourceSenseId");
    if (seen.has(id)) continue;
    const original = byId.get(id);
    if (!original) throw new Error(`LLM selected an unknown sense: ${id}.`);
    const normalizedWord = requiredString(raw?.word, "word");
    if (!sameWord(word, normalizedWord)) {
      throw new Error("LLM changed the requested word.");
    }

    const sense = candidateToVocabularySense(word, original);
    const apiPronunciation = sense.pronunciation;
    const apiPartOfSpeech = sense.partOfSpeech;
    const apiExample = sense.example;
    sense.partOfSpeech = requiredString(raw?.partOfSpeech, "partOfSpeech");
    sense.pronunciation = requiredString(raw?.pronunciation, "pronunciation");
    sense.meaningEn = requiredString(raw?.meaningEn, "meaningEn");
    sense.meaningVi = requiredString(raw?.meaningVi, "meaningVi");
    sense.example = requiredString(raw?.example, "example");
    const cefr = typeof raw?.cefrLevel === "string" ? raw.cefrLevel : "unknown";
    sense.cefrLevel = CEFR_LEVELS.has(cefr as CEFRLevel)
      ? (cefr as CEFRLevel)
      : "unknown";
    sense.partOfSpeechSource =
      apiPartOfSpeech !== "unknown" && sense.partOfSpeech === apiPartOfSpeech
        ? "dictionary"
        : "ai";
    sense.pronunciationSource =
      apiPronunciation && sense.pronunciation === apiPronunciation
        ? "dictionary"
        : "ai";
    sense.exampleSource =
      apiExample && sense.example === apiExample ? "dictionary" : "ai";
    normalized.push(sense);
    seen.add(id);
  }

  if (!normalized.length) {
    throw new Error("LLM selected no valid dictionary meaning.");
  }
  return normalized;
}

async function normalizeWithConfiguredLLM(
  word: string,
  candidates: ReturnType<typeof flattenDictionaryEntries>,
  itemId?: number,
) {
  const serviceId = (getPref("flashcards.llmService") as string)?.trim();
  if (!serviceId) throw new Error("Choose a vocabulary LLM in Preferences.");
  const service = addon.data.translate.services.getServiceById(serviceId);
  if (!service?.supportsPromptOverride) {
    throw new Error(`Service ${serviceId} cannot normalize vocabulary data.`);
  }

  const pool = buildMeaningCandidatePool(candidates);
  const compact = pool.map((sense) => ({
    sourceSenseId: sense.id,
    partOfSpeech: sense.partOfSpeech,
    pronunciations: sense.pronunciations.map((item) => item.text),
    definition: sense.definition,
    parentDefinition: sense.parentDefinition || undefined,
    tags: sense.tags,
    examples: sense.examples.slice(0, 2),
  }));
  const system = [
    "You normalize English dictionary data for a Vietnamese learner.",
    "Rank and return at most five distinct, common meanings from the supplied candidates; array order is the popularity rank.",
    "Ignore archaic, obsolete, rare, and overly specialized meanings.",
    "Never invent a meaning, change sourceSenseId, or change the requested word.",
    "For every returned meaning, provide a normalized English part of speech, one IPA pronunciation, concise English and Vietnamese meanings, one short natural English example, and an estimated CEFR level.",
    "Write meaningVi as polished Vietnamese dictionary equivalents: prefer concise, idiomatic headwords or short phrases that a Vietnamese learner would naturally use, not a literal translation or a sentence-length paraphrase of meaningEn.",
    'Preserve the exact sense and nuance; for example, translate "obstinate" as "cứng đầu; bướng bỉnh", not as a literal Vietnamese rendering of its English definition.',
    "When one English sense has two established Vietnamese equivalents, separate them with a semicolon and do not add explanations unless needed to distinguish the sense.",
    "Reuse accurate API fields; fill only missing or unsuitable fields.",
    "CEFR must be A1, A2, B1, B2, C1, C2, or unknown and is only an estimate.",
    'Return only JSON: {"senses":[{"sourceSenseId":string,"word":string,"partOfSpeech":string,"pronunciation":string,"meaningVi":string,"meaningEn":string,"example":string,"cefrLevel":"A1"|"A2"|"B1"|"B2"|"C1"|"C2"|"unknown"}]}.',
  ].join(" ");
  const input = JSON.stringify({ word, candidates: compact });
  const llmTask = {
    id: `vocabulary-${Date.now()}`,
    type: "custom",
    raw: input,
    result: "",
    audio: [],
    service: serviceId,
    candidateServices: [],
    itemId,
    langfrom: "en",
    langto: "vi",
    langfromInferred: false,
    status: "waiting",
    extraTasks: [],
    silent: true,
    callerID: "vocabulary",
    processed: false,
    wordLookup: false,
    flashcardSaved: false,
    llmPromptOverride: { system, user: input },
  } as TranslateTask & {
    llmPromptOverride: { system: string; user: string };
  };

  await new TranslateTaskRunner(service.translate).run(llmTask);
  if (llmTask.status !== "success" || !llmTask.result.trim()) {
    throw new Error("The configured LLM could not normalize this word.");
  }
  return {
    serviceId,
    senses: normalizeVocabularyResponse(
      word,
      parseVocabularyJSON(llmTask.result),
      candidates,
    ),
  };
}

const translate = <TranslateService["translate"]>async function (data) {
  const requestedWord = data.raw.normalize("NFKC").trim();
  const language = "en";
  const xhr = await Zotero.HTTP.request(
    "GET",
    `https://freedictionaryapi.com/api/v1/entries/${encodeURIComponent(
      language,
    )}/${encodeURIComponent(requestedWord)}`,
    { headers: { Accept: "application/json" }, responseType: "json" },
  );
  if (xhr?.status !== 200) throw new Error(`Request error: ${xhr?.status}`);

  const payload = xhr.response;
  const word = typeof payload?.word === "string" ? payload.word : requestedWord;
  const candidates = flattenDictionaryEntries(payload);
  if (!candidates.length)
    throw new Error(`No dictionary entry found for ${word}.`);

  const lookup: VocabularyLookup = {
    word,
    language,
    sourceUrl:
      typeof payload?.source?.url === "string"
        ? payload.source.url
        : `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    sourceLicense:
      typeof payload?.source?.license?.name === "string"
        ? payload.source.license.name
        : "CC BY-SA 4.0",
    normalizationStatus: "raw",
    normalizationVersion: VOCABULARY_NORMALIZATION_VERSION,
    senses: fallbackVocabularySenses(word, candidates),
  };

  try {
    const normalized = await normalizeWithConfiguredLLM(
      word,
      candidates,
      data.itemId,
    );
    lookup.llmService = normalized.serviceId;
    lookup.senses = normalized.senses;
    lookup.normalizationStatus = "normalized";
  } catch (error) {
    lookup.normalizationStatus = "error";
    lookup.llmError = error instanceof Error ? error.message : String(error);
  }

  (data as VocabularyTask).vocabularyLookup = lookup;
  data.result = formatVocabularyLookup(lookup);
};

export const FreeDictionaryAPI: TranslateService = {
  id: "freedictionaryapi",
  type: "word",
  translate,
};
