import { getPref } from "../../utils/prefs";
import type { TranslateTask } from "../../utils/task";
import { isSingleWordText } from "../../utils/word";

const SCHEMA_VERSION = 1;
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
  if (data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.cards)) {
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
  return { schemaVersion: SCHEMA_VERSION, cards: data.cards };
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
  if (
    !getPref("flashcards.autoSave") ||
    task.type !== "text" ||
    !task.wordLookup ||
    task.flashcardSaved ||
    task.status !== "success" ||
    !isSingleWordText(task.raw) ||
    !task.raw.trim() ||
    !task.result.trim()
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
      });
    }
    await writeDatabase(database);
    task.flashcardSaved = true;
    return true;
  });
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
  const rows = [
    [
      "word",
      "meaning",
      "language_from",
      "language_to",
      "service",
      "source_title",
      "created_at",
      "last_seen_at",
      "lookup_count",
    ],
    ...cards.map((card) => [
      card.word,
      card.meaning,
      card.langFrom,
      card.langTo,
      card.service,
      card.itemTitle || "",
      card.createdAt,
      card.lastSeenAt,
      card.lookupCount,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export async function exportFlashcardsCSV(filePath: string) {
  const database = await readFlashcards();
  await IOUtils.writeUTF8(filePath, flashcardsToCSV(database.cards), {
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
    if (!previous || card.lastSeenAt > previous.lastSeenAt)
      merged.set(key, card);
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
