import {
  flashcardsToCSV,
  flashcardsToAnkiTSV,
  getFlashcardKey,
  migrateFlashcardRecords,
  normalizeFlashcardWord,
} from "../src/modules/flashcards/storage";
import type { Flashcard } from "../src/modules/flashcards/storage";
import { isSingleWordText } from "../src/utils/word";

describe("Flashcards", function () {
  it("recognizes a single word and rejects phrases", function () {
    assert.isTrue(isSingleWordText("  résumé! "));
    assert.isFalse(isSingleWordText("two words"));
    assert.isFalse(isSingleWordText("   "));
  });

  it("normalizes duplicate keys by word and language pair", function () {
    assert.equal(normalizeFlashcardWord("  Ｔｅｓｔ "), "test");
    assert.equal(
      getFlashcardKey("Test", "en", "vi"),
      getFlashcardKey(" test ", "en", "vi"),
    );
    assert.notEqual(
      getFlashcardKey("test", "en", "vi"),
      getFlashcardKey("test", "en", "fr"),
    );
  });

  it("exports Excel-safe UTF-8 CSV", function () {
    const card: Flashcard = {
      id: "1",
      word: "=SUM(1,2)",
      meaning: 'line one\n"line two"',
      meaningEdited: false,
      langFrom: "en",
      langTo: "vi",
      service: "dictionary",
      audio: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      lookupCount: 1,
    };
    const csv = flashcardsToCSV([card]);
    assert.isTrue(csv.startsWith("\uFEFF"));
    assert.include(csv, '"\'=SUM(1,2)"');
    assert.include(csv, '"line one\n""line two"""');
  });

  it("exports stable Anki fields with HTML and tags", function () {
    const card: Flashcard = {
      id: "stable-card-id",
      word: "cache",
      meaning: "bộ nhớ đệm",
      meaningEdited: false,
      langFrom: "en",
      langTo: "vi",
      service: "freedictionaryapi",
      audio: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      lookupCount: 1,
      senseId: "e0-s2",
      partOfSpeech: "noun",
      pronunciation: "/kæʃ/",
      definitionEn: "A fast storage layer.",
      definitionVi: "Một lớp lưu trữ nhanh.",
      exampleEn: "The result is stored in the cache.",
      exampleVi: "Kết quả được lưu trong bộ nhớ đệm.",
      exampleSource: "ai",
      tags: ["computing"],
      senses: [
        {
          id: "e0-s2",
          word: "cache",
          partOfSpeech: "noun",
          pronunciation: "/kæʃ/",
          meaningEn: "A fast storage layer.",
          meaningVi: "Một lớp lưu trữ nhanh.",
          example: "The result is stored in the cache.",
          cefrLevel: "B2",
          cefrEstimated: true,
          definitionOriginal: "A fast storage layer.",
          partOfSpeechSource: "dictionary",
          pronunciationSource: "dictionary",
          exampleSource: "ai",
          synonyms: [],
          antonyms: [],
          tags: ["computing"],
        },
        {
          id: "e0-s3",
          word: "cache",
          partOfSpeech: "noun",
          pronunciation: "/kæʃ/",
          meaningEn: "A hidden collection of items.",
          meaningVi: "Một kho vật phẩm được cất giấu.",
          example: "They found a cache of supplies.",
          cefrLevel: "C1",
          cefrEstimated: true,
          definitionOriginal: "A hidden collection of items.",
          partOfSpeechSource: "dictionary",
          pronunciationSource: "dictionary",
          exampleSource: "ai",
          synonyms: [],
          antonyms: [],
          tags: [],
        },
      ],
    };
    const tsv = flashcardsToAnkiTSV([card]);
    assert.include(tsv, "#separator:Tab");
    assert.include(tsv, "#html:true");
    assert.include(tsv, "stable-card-id\t");
    assert.include(tsv, "zotero-vocabulary computing");
    assert.include(tsv, "Một lớp lưu trữ nhanh.");
    assert.include(tsv, "Một kho vật phẩm được cất giấu.");
    assert.include(tsv, "B2");
  });

  it("exports one CSV row per structured meaning", function () {
    const base: Flashcard = {
      id: "multi",
      word: "run",
      meaning: "two meanings",
      meaningEdited: false,
      langFrom: "en",
      langTo: "vi",
      service: "freedictionaryapi",
      audio: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
      lookupCount: 1,
      senses: ["verb", "noun"].map((partOfSpeech, index) => ({
        id: `sense-${index}`,
        word: "run",
        partOfSpeech,
        pronunciation: "/rʌn/",
        meaningEn: `Meaning ${index}`,
        meaningVi: `Nghĩa ${index}`,
        example: `Example ${index}.`,
        cefrLevel: "A2" as const,
        cefrEstimated: true as const,
        definitionOriginal: `Meaning ${index}`,
        partOfSpeechSource: "dictionary" as const,
        pronunciationSource: "dictionary" as const,
        exampleSource: "ai" as const,
        synonyms: [],
        antonyms: [],
        tags: [],
      })),
    };
    const csv = flashcardsToCSV([base]);
    assert.lengthOf(csv.split("\r\n"), 3);
    assert.include(csv, '"sense-0"');
    assert.include(csv, '"sense-1"');
  });

  it("merges schema-v2 per-sense cards without dropping meanings", function () {
    const legacy = (
      id: string,
      senseId: string,
      definitionVi: string,
    ): Flashcard => ({
      id,
      word: "thread",
      meaning: definitionVi,
      meaningEdited: false,
      langFrom: "en",
      langTo: "vi",
      service: "freedictionaryapi",
      audio: [],
      createdAt: `2026-01-0${id}T00:00:00.000Z`,
      lastSeenAt: `2026-01-0${id}T00:00:00.000Z`,
      lookupCount: 1,
      senseId,
      partOfSpeech: "noun",
      definitionEn: `Definition ${id}`,
      definitionVi,
    });
    const migrated = migrateFlashcardRecords([
      legacy("1", "sense-a", "Sợi chỉ"),
      legacy("2", "sense-b", "Chuỗi thảo luận"),
    ]);
    assert.lengthOf(migrated, 1);
    assert.lengthOf(migrated[0].senses || [], 2);
    assert.equal(migrated[0].lookupCount, 2);
  });
});
