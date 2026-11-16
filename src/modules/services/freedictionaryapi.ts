import { getPref, TranslateTask, TranslateTaskRunner } from "../../utils";
import {
  buildMeaningCandidatePool,
  candidateToVocabularySense,
  fallbackVocabularySenses,
  flattenDictionaryEntries,
  formatVocabularyLookup,
  VocabularyLookup,
  VocabularySense,
} from "../dictionary/model";
import { TranslateService } from "./base";

type VocabularyTask = TranslateTask & { vocabularyLookup?: VocabularyLookup };

const SUPPORTED_LLM_SERVICES = new Set([
  "chatgpt",
  "customgpt1",
  "customgpt2",
  "customgpt3",
  "azuregpt",
  "claude",
  "gemini",
]);

function parseJSONResponse(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = (fenced || text).trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM did not return JSON.");
  return JSON.parse(source.slice(start, end + 1));
}

async function enrichWithConfiguredLLM(
  word: string,
  candidates: ReturnType<typeof flattenDictionaryEntries>,
  itemId?: number,
) {
  const serviceId = getPref("translateSource") as string;
  if (!SUPPORTED_LLM_SERVICES.has(serviceId)) {
    throw new Error(
      "The paragraph translation service is not a supported LLM. Raw meanings are shown.",
    );
  }
  const service = addon.data.translate.services.getServiceById(serviceId);
  if (!service) throw new Error(`LLM service ${serviceId} is unavailable.`);

  const pool = buildMeaningCandidatePool(candidates);
  const compact = pool.map((sense) => ({
    id: sense.id,
    partOfSpeech: sense.partOfSpeech,
    definition: sense.definition,
    parentDefinition: sense.parentDefinition || undefined,
    tags: sense.tags,
    example: sense.examples[0] || undefined,
  }));
  const system = [
    "You curate English vocabulary for a Vietnamese learner who reads academic computer-science papers.",
    "Select at most two distinct meanings from the supplied dictionary candidates.",
    "Prefer one common everyday meaning and one academic/computer-science meaning when one genuinely exists.",
    "Otherwise select the two most useful everyday meanings. Ignore archaic, obsolete, rare, and overly specialized meanings.",
    "Never invent a meaning or change a candidate id.",
    "Rewrite definitionEn in concise learner-friendly English and translate it accurately to Vietnamese.",
    "Use the supplied example when present. When absent, create one short natural example and its Vietnamese translation.",
    'Return only JSON: {"senses":[{"id":string,"definitionEn":string,"definitionVi":string,"exampleEn":string,"exampleVi":string,"reason":"daily"|"academic-cs"}]}.',
  ].join(" ");
  const llmTask = {
    id: `vocabulary-${Date.now()}`,
    type: "custom",
    raw: JSON.stringify({ word, candidates: compact }),
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
    llmPromptOverride: {
      system,
      user: JSON.stringify({ word, candidates: compact }),
    },
  } as TranslateTask & {
    llmPromptOverride: { system: string; user: string };
  };
  await new TranslateTaskRunner(service.translate).run(llmTask);
  if (llmTask.status !== "success" || !llmTask.result.trim()) {
    throw new Error("The configured LLM could not enrich this word.");
  }

  const parsed = parseJSONResponse(llmTask.result);
  if (!Array.isArray(parsed?.senses)) {
    throw new Error("LLM JSON is missing the senses array.");
  }
  const byId = new Map(pool.map((sense) => [sense.id, sense]));
  const seen = new Set<string>();
  const enriched: VocabularySense[] = [];
  for (const raw of parsed.senses) {
    if (enriched.length >= 2 || typeof raw?.id !== "string" || seen.has(raw.id))
      continue;
    const original = byId.get(raw.id);
    if (!original) continue;
    seen.add(raw.id);
    const sense = candidateToVocabularySense(
      original,
      raw.reason === "academic-cs" ? "academic-cs" : "daily",
    );
    if (typeof raw.definitionEn === "string" && raw.definitionEn.trim())
      sense.definitionEn = raw.definitionEn.trim();
    if (typeof raw.definitionVi === "string")
      sense.definitionVi = raw.definitionVi.trim();
    if (typeof raw.exampleEn === "string" && raw.exampleEn.trim()) {
      sense.exampleEn = raw.exampleEn.trim();
      sense.exampleSource = original.examples.length ? "dictionary" : "ai";
    }
    if (typeof raw.exampleVi === "string")
      sense.exampleVi = raw.exampleVi.trim();
    enriched.push(sense);
  }
  if (!enriched.length)
    throw new Error("LLM selected no valid dictionary meaning.");
  return { serviceId, senses: enriched };
}

const translate = <TranslateService["translate"]>async function (data) {
  const word = data.raw.normalize("NFKC").trim();
  const language = "en";
  const xhr = await Zotero.HTTP.request(
    "GET",
    `https://freedictionaryapi.com/api/v1/entries/${encodeURIComponent(
      language,
    )}/${encodeURIComponent(word)}`,
    {
      headers: {
        Accept: "application/json",
      },
      responseType: "json",
    },
  );
  if (xhr?.status !== 200) {
    throw `Request error: ${xhr?.status}`;
  }

  const payload = xhr.response;
  const candidates = flattenDictionaryEntries(payload);
  if (!candidates.length)
    throw new Error(`No dictionary entry found for ${word}.`);
  const lookup: VocabularyLookup = {
    word: typeof payload?.word === "string" ? payload.word : word,
    language,
    sourceUrl:
      typeof payload?.source?.url === "string"
        ? payload.source.url
        : `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    sourceLicense:
      typeof payload?.source?.license?.name === "string"
        ? payload.source.license.name
        : "CC BY-SA 4.0",
    senses: fallbackVocabularySenses(candidates),
  };
  try {
    const enriched = await enrichWithConfiguredLLM(
      word,
      candidates,
      data.itemId,
    );
    lookup.llmService = enriched.serviceId;
    lookup.senses = enriched.senses;
  } catch (error) {
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
