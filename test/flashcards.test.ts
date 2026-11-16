import {
  flashcardsToCSV,
  flashcardsToAnkiTSV,
  getFlashcardKey,
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
    };
    const tsv = flashcardsToAnkiTSV([card]);
    assert.include(tsv, "#separator:Tab");
    assert.include(tsv, "#html:true");
    assert.include(tsv, "stable-card-id\t");
    assert.include(tsv, "zotero-vocabulary computing");
    assert.include(tsv, "Một lớp lưu trữ nhanh.");
  });
});
