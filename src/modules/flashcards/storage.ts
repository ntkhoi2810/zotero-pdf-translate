import { getPref } from "../../utils/prefs";
import type { TranslateTask } from "../../utils/task";
import { isSingleWordText } from "../../utils/word";
import type { VocabularyLookup, VocabularySense } from "../dictionary/model";

const SCHEMA_VERSION = 3;
const DATA_DIRECTORY = "zotero-pdf-translate";
const DATA_FILE = "flashcards.json";

export interface Flashcard {
  id: string;
  word: string;
  meaning: string;
  meaningEdited: boolean;
  langFrom: string;
  langTo: string;
  service: string;
  audio: { text: string; url: string }[];
  itemID?: number;
  itemTitle?: string;
  createdAt: string;
  lastSeenAt: string;
  lookupCount: number;
  /** Structured meanings. Schema v3 stores all selected meanings on one card. */
  senses?: VocabularySense[];
  // Schema v1/v2 compatibility fields. They are migrated into `senses`.
  senseId?: string;
  partOfSpeech?: string;
  pronunciation?: string;
  definitionOriginal?: string;
  definitionEn?: string;
  definitionVi?: string;
  exampleEn?: string;
  exampleVi?: string;
  exampleSource?: "dictionary" | "ai" | "none";
  synonyms?: string[];
  antonyms?: string[];
  tags?: string[];
  sourceUrl?: string;
  sourceLicense?: string;
  llmService?: string;
}

interface FlashcardDatabase {
  schemaVersion: number;
  cards: Flashcard[];
}

const emptyDatabase = (): FlashcardDatabase => ({
  schemaVersion: SCHEMA_VERSION,
  cards: [],
});

let writeQueue: Promise<unknown> = Promise.resolve();

export function normalizeFlashcardWord(word: string) {
  return word.normalize("NFKC").trim().toLocaleLowerCase();
}

export function getFlashcardKey(
  word: string,
  langFrom: string,
  langTo: string,
) {
  return `${normalizeFlashcardWord(word)}\u0000${langFrom}\u0000${langTo}`;
}

function getStorageDirectory() {
  const customDirectory = (
    getPref("flashcards.storageDirectory") as string
  )?.trim();
  return (
    customDirectory ||
    PathUtils.join(Zotero.getZoteroDirectory().path, DATA_DIRECTORY)
  );
}

export function getFlashcardFilePath() {
  return PathUtils.join(getStorageDirectory(), DATA_FILE);
}

function validateDatabase(value: unknown): FlashcardDatabase {
  if (!value || typeof value !== "object") {
    throw new Error("Flashcard data is not a JSON object.");
  }
  const data = value as Partial<FlashcardDatabase>;
  if (
    ![1, 2, SCHEMA_VERSION].includes(data.schemaVersion || 0) ||
    !Array.isArray(data.cards)
  ) {
    throw new Error("Unsupported or invalid flashcard data format.");
  }
  const cardsAreValid = data.cards.every(
    (card) =>
      card &&
      typeof card === "object" &&
      typeof card.id === "string" &&
      typeof card.word === "string" &&
      typeof card.meaning === "string" &&
      typeof card.meaningEdited === "boolean" &&
      typeof card.langFrom === "string" &&
      typeof card.langTo === "string" &&
      typeof card.service === "string" &&
      Array.isArray(card.audio) &&
      typeof card.createdAt === "string" &&
      typeof card.lastSeenAt === "string" &&
      typeof card.lookupCount === "number",
  );
  if (!cardsAreValid) {
    throw new Error("Flashcard data contains an invalid card.");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    cards: migrateFlashcardRecords(data.cards as Flashcard[]),
  };
}

function legacySense(card: Flashcard): VocabularySense | undefined {
  if (!card.senseId && !card.definitionEn && !card.definitionVi)
    return undefined;
  return {
    id: card.senseId || `legacy-${card.id}`,
    word: card.word,
    partOfSpeech: card.partOfSpeech || "unknown",
    pronunciation: card.pronunciation || "",
    meaningEn: card.definitionEn || card.definitionOriginal || card.meaning,
    meaningVi: card.definitionVi || "",
    example: card.exampleEn || "",
    cefrLevel: "unknown",
    cefrEstimated: true,
    definitionOriginal: card.definitionOriginal || card.definitionEn || "",
    partOfSpeechSource: card.partOfSpeech ? "dictionary" : "none",
    pronunciationSource: card.pronunciation ? "dictionary" : "none",
    exampleSource:
      card.exampleSource || (card.exampleEn ? "dictionary" : "none"),
    synonyms: card.synonyms || [],
    antonyms: card.antonyms || [],
    tags: card.tags || [],
  };
}

export function migrateFlashcardRecords(cards: Flashcard[]) {
  const grouped = new Map<string, Flashcard>();
  for (const source of cards) {
    const senses = Array.isArray(source.senses)
      ? source.senses
      : [legacySense(source)].filter(
          (sense): sense is VocabularySense => !!sense,
        );
    const key = getFlashcardKey(source.word, source.langFrom, source.langTo);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...source, senses });
      continue;
    }
    const newest = source.lastSeenAt > existing.lastSeenAt ? source : existing;
    const byId = new Map(
      [...(existing.senses || []), ...senses].map((sense) => [sense.id, sense]),
    );
    grouped.set(key, {
      ...existing,
      ...newest,
      id: existing.createdAt <= source.createdAt ? existing.id : source.id,
      createdAt:
        existing.createdAt <= source.createdAt
          ? existing.createdAt
          : source.createdAt,
      lastSeenAt:
        existing.lastSeenAt >= source.lastSeenAt
          ? existing.lastSeenAt
          : source.lastSeenAt,
      lookupCount: existing.lookupCount + source.lookupCount,
      senses: [...byId.values()],
    });
  }
  return [...grouped.values()].sort((a, b) =>
    b.lastSeenAt.localeCompare(a.lastSeenAt),
  );
}

async function ensureStorageDirectory() {
  await IOUtils.makeDirectory(getStorageDirectory(), {
    createAncestors: true,
    ignoreExisting: true,
  });
}

export async function readFlashcards(): Promise<FlashcardDatabase> {
  const filePath = getFlashcardFilePath();
  if (!(await IOUtils.exists(filePath))) {
    return emptyDatabase();
  }
  try {
    return validateDatabase(JSON.parse(await IOUtils.readUTF8(filePath)));
  } catch (error) {
    throw new Error(
      `Could not read ${filePath}. The file was left unchanged. ${String(error)}`,
    );
  }
}

async function writeDatabase(database: FlashcardDatabase) {
  await ensureStorageDirectory();
  const filePath = getFlashcardFilePath();
  const backupPath = `${filePath}.bak`;
  const temporaryPath = `${filePath}.tmp`;
  if (await IOUtils.exists(filePath)) {
    await IOUtils.writeUTF8(backupPath, await IOUtils.readUTF8(filePath), {
      tmpPath: `${backupPath}.tmp`,
    });
  }
  await IOUtils.writeUTF8(filePath, JSON.stringify(database, null, 2), {
    tmpPath: temporaryPath,
  });
}

function withWriteLock<T>(operation: () => Promise<T>) {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function saveFlashcardFromTask(task: TranslateTask) {
  const vocabularyLookup = (
    task as TranslateTask & { vocabularyLookup?: VocabularyLookup }
  ).vocabularyLookup;
  if (
    !getPref("flashcards.autoSave") ||
    task.type !== "text" ||
    !task.wordLookup ||
    task.flashcardSaved ||
    task.status !== "success" ||
    !isSingleWordText(task.raw) ||
    !task.raw.trim() ||
    !task.result.trim() ||
    vocabularyLookup
  ) {
    return false;
  }

  return withWriteLock(async () => {
    const database = await readFlashcards();
    const now = new Date().toISOString();
    const langFrom = task.langfrom || "";
    const langTo = task.langto || "";
    const key = getFlashcardKey(task.raw, langFrom, langTo);
    const existing = database.cards.find(
      (card) => getFlashcardKey(card.word, card.langFrom, card.langTo) === key,
    );
    const item = task.itemId ? Zotero.Items.get(task.itemId) : false;
    const topItem = item ? Zotero.Items.getTopLevel([item])[0] : false;

    if (existing) {
      existing.lastSeenAt = now;
      existing.lookupCount += 1;
      existing.service = task.service;
      existing.audio = task.audio;
      if (!existing.meaningEdited) {
        existing.meaning = task.result.trim();
      }
      if (topItem) {
        existing.itemID = topItem.id;
        existing.itemTitle = (topItem.getField("title") as string) || "";
      }
    } else {
      database.cards.unshift({
        id: `${Zotero.Utilities.randomString()}-${Date.now()}`,
        word: task.raw.trim(),
        meaning: task.result.trim(),
        meaningEdited: false,
        langFrom,
        langTo,
        service: task.service,
        audio: task.audio,
        itemID: topItem ? topItem.id : undefined,
        itemTitle: topItem
          ? (topItem.getField("title") as string) || ""
          : undefined,
        createdAt: now,
        lastSeenAt: now,
        lookupCount: 1,
        senses: [],
      });
    }
    await writeDatabase(database);
    task.flashcardSaved = true;
    return true;
  });
}

function vocabularyMeaning(senses: VocabularySense[]) {
  return senses
    .map((sense, index) =>
      [
        `${index + 1}. ${sense.meaningVi}`,
        sense.meaningEn,
        sense.example ? `Example: ${sense.example}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export async function saveVocabularySensesFromTask(
  task: TranslateTask,
  senseIds: string[],
) {
  const lookup = (
    task as TranslateTask & { vocabularyLookup?: VocabularyLookup }
  ).vocabularyLookup;
  const uniqueIds = [...new Set(senseIds)].slice(0, 2);
  const selected = uniqueIds
    .map((id) => lookup?.senses.find((candidate) => candidate.id === id))
    .filter((sense): sense is VocabularySense => !!sense);
  if (
    !lookup ||
    lookup.normalizationStatus !== "normalized" ||
    !selected.length ||
    selected.length !== uniqueIds.length
  ) {
    return false;
  }

  return withWriteLock(async () => {
    const database = await readFlashcards();
    const now = new Date().toISOString();
    const key = getFlashcardKey(lookup.word, lookup.language, "vi");
    const existing = database.cards.find(
      (card) => getFlashcardKey(card.word, card.langFrom, card.langTo) === key,
    );
    const item = task.itemId ? Zotero.Items.get(task.itemId) : false;
    const topItem = item ? Zotero.Items.getTopLevel([item])[0] : false;
    const structured = {
      senses: selected,
      sourceUrl: lookup.sourceUrl,
      sourceLicense: lookup.sourceLicense,
      llmService: lookup.llmService,
    };
    if (existing) {
      existing.lastSeenAt = now;
      existing.lookupCount += 1;
      existing.service = task.service;
      existing.audio = task.audio;
      Object.assign(existing, structured);
      existing.meaning = vocabularyMeaning(selected);
      existing.meaningEdited = false;
      if (topItem) {
        existing.itemID = topItem.id;
        existing.itemTitle = (topItem.getField("title") as string) || "";
      }
    } else {
      database.cards.unshift({
        id: `${Zotero.Utilities.randomString()}-${Date.now()}`,
        word: lookup.word,
        meaning: vocabularyMeaning(selected),
        meaningEdited: false,
        langFrom: lookup.language,
        langTo: "vi",
        service: task.service,
        audio: task.audio,
        itemID: topItem ? topItem.id : undefined,
        itemTitle: topItem
          ? (topItem.getField("title") as string) || ""
          : undefined,
        createdAt: now,
        lastSeenAt: now,
        lookupCount: 1,
        ...structured,
      });
    }
    await writeDatabase(database);
    task.flashcardSaved = true;
    return true;
  });
}

/** Compatibility helper for callers that save exactly one selected meaning. */
export function saveVocabularySenseFromTask(
  task: TranslateTask,
  senseId: string,
) {
  return saveVocabularySensesFromTask(task, [senseId]);
}

export async function updateFlashcard(
  id: string,
  changes: Pick<Flashcard, "word" | "meaning">,
) {
  return withWriteLock(async () => {
    const database = await readFlashcards();
    const card = database.cards.find((candidate) => candidate.id === id);
    if (!card) return false;
    card.word = changes.word.trim();
    card.meaning = changes.meaning.trim();
    card.meaningEdited = true;
    await writeDatabase(database);
    return true;
  });
}

export async function deleteFlashcard(id: string) {
  return withWriteLock(async () => {
    const database = await readFlashcards();
    const nextCards = database.cards.filter((card) => card.id !== id);
    if (nextCards.length === database.cards.length) return false;
    database.cards = nextCards;
    await writeDatabase(database);
    return true;
  });
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function flashcardsToCSV(cards: Flashcard[]) {
  const dataRows = cards.flatMap((card) => {
    const senses = card.senses?.length ? card.senses : [legacySense(card)];
    return senses.map((sense) => [
      card.word,
      sense?.partOfSpeech || "",
      sense?.pronunciation || "",
      sense?.meaningEn || "",
      sense?.meaningVi || "",
      sense?.example || "",
      sense?.cefrLevel || "unknown",
      sense?.exampleSource || "",
      (sense?.synonyms || []).join("; "),
      (sense?.antonyms || []).join("; "),
      (sense?.tags || []).join("; "),
      card.meaning,
      card.langFrom,
      card.langTo,
      card.service,
      card.itemTitle || "",
      card.createdAt,
      card.lastSeenAt,
      card.lookupCount,
      card.id,
      sense?.id || "",
      card.sourceUrl || "",
      card.sourceLicense || "",
      card.llmService || "",
    ]);
  });
  const rows = [
    [
      "word",
      "part_of_speech",
      "pronunciation",
      "definition_english",
      "definition_vietnamese",
      "example_english",
      "cefr_estimated",
      "example_source",
      "synonyms",
      "antonyms",
      "labels",
      "meaning",
      "language_from",
      "language_to",
      "service",
      "source_title",
      "created_at",
      "last_seen_at",
      "lookup_count",
      "card_id",
      "sense_id",
      "dictionary_source",
      "dictionary_license",
      "llm_service",
    ],
    ...dataRows,
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

function escapeHTML(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tsvCell(value: unknown) {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, "<br>");
}

export function flashcardsToAnkiTSV(cards: Flashcard[]) {
  const rows = cards.map((card) => {
    const senses = card.senses?.length
      ? card.senses
      : [legacySense(card)].filter(
          (sense): sense is VocabularySense => !!sense,
        );
    const pronunciations = [...new Set(senses.map((s) => s.pronunciation))]
      .filter(Boolean)
      .join(" · ");
    const front = [
      `<div class="word">${escapeHTML(card.word)}</div>`,
      pronunciations
        ? `<div class="pronunciation">${escapeHTML(pronunciations)}</div>`
        : "",
    ]
      .filter(Boolean)
      .join("");
    const structuredBack = senses
      .map(
        (sense, index) =>
          `<section class="sense"><div class="sense-heading">${index + 1}. ${escapeHTML(
            sense.partOfSpeech,
          )} · ~${escapeHTML(sense.cefrLevel)}</div><div class="definition vi">${escapeHTML(
            sense.meaningVi,
          )}</div><div class="definition en">${escapeHTML(
            sense.meaningEn,
          )}</div>${
            sense.example
              ? `<div class="example">${escapeHTML(sense.example)}</div>`
              : ""
          }</section>`,
      )
      .join("");
    const back = [
      structuredBack ||
        `<div class="definition">${escapeHTML(card.meaning)}</div>`,
      card.sourceUrl
        ? `<div class="source">Source: ${escapeHTML(card.sourceUrl)} (${escapeHTML(
            card.sourceLicense || "",
          )})</div>`
        : "",
    ]
      .filter(Boolean)
      .join("");
    const tags = [
      "zotero-vocabulary",
      ...senses.flatMap((sense) => sense.tags),
      ...senses.map((sense) => sense.cefrLevel),
    ]
      .map((tag) => tag.replace(/\s+/g, "_"))
      .join(" ");
    return [card.id, front, back, tags].map(tsvCell).join("\t");
  });
  return [
    "#separator:Tab",
    "#html:true",
    "#tags column:4",
    "#columns:ID\tFront\tBack\tTags",
    ...rows,
  ].join("\r\n");
}

export async function exportFlashcardsCSV(filePath: string) {
  const database = await readFlashcards();
  await IOUtils.writeUTF8(filePath, flashcardsToCSV(database.cards), {
    tmpPath: `${filePath}.tmp`,
  });
  return database.cards.length;
}

export async function exportFlashcardsAnkiTSV(filePath: string) {
  const database = await readFlashcards();
  await IOUtils.writeUTF8(filePath, flashcardsToAnkiTSV(database.cards), {
    tmpPath: `${filePath}.tmp`,
  });
  return database.cards.length;
}

export async function migrateFlashcardStorage(targetDirectory: string) {
  const sourceDatabase = await readFlashcards();
  const targetFile = PathUtils.join(targetDirectory, DATA_FILE);
  await IOUtils.makeDirectory(targetDirectory, {
    createAncestors: true,
    ignoreExisting: true,
  });
  let targetDatabase = emptyDatabase();
  if (await IOUtils.exists(targetFile)) {
    targetDatabase = validateDatabase(
      JSON.parse(await IOUtils.readUTF8(targetFile)),
    );
  }
  const merged = new Map<string, Flashcard>();
  for (const card of [...targetDatabase.cards, ...sourceDatabase.cards]) {
    const key = getFlashcardKey(card.word, card.langFrom, card.langTo);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, card);
      continue;
    }
    const newest = card.lastSeenAt > previous.lastSeenAt ? card : previous;
    const senses = new Map(
      [...(previous.senses || []), ...(card.senses || [])].map((sense) => [
        sense.id,
        sense,
      ]),
    );
    merged.set(key, {
      ...previous,
      ...newest,
      senses: [...senses.values()],
      lookupCount: previous.lookupCount + card.lookupCount,
      createdAt:
        previous.createdAt < card.createdAt
          ? previous.createdAt
          : card.createdAt,
      lastSeenAt:
        previous.lastSeenAt > card.lastSeenAt
          ? previous.lastSeenAt
          : card.lastSeenAt,
    });
  }
  const mergedDatabase: FlashcardDatabase = {
    schemaVersion: SCHEMA_VERSION,
    cards: [...merged.values()].sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt),
    ),
  };
  await IOUtils.writeUTF8(targetFile, JSON.stringify(mergedDatabase, null, 2), {
    tmpPath: `${targetFile}.tmp`,
  });
  validateDatabase(JSON.parse(await IOUtils.readUTF8(targetFile)));
  return mergedDatabase.cards.length;
}
