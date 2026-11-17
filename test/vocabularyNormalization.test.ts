import { flattenDictionaryEntries } from "../src/modules/dictionary/model";
import { normalizeVocabularyResponse } from "../src/modules/services/freedictionaryapi";

describe("Vocabulary LLM normalization", function () {
  const candidates = flattenDictionaryEntries({
    entries: [
      {
        partOfSpeech: "noun",
        pronunciations: [{ type: "ipa", text: "/kæʃ/", tags: ["US"] }],
        senses: Array.from({ length: 6 }, (_, index) => ({
          definition: `Meaning ${index + 1}`,
          examples: index === 0 ? ["The result is stored in the cache."] : [],
          tags: [],
          synonyms: [],
          antonyms: [],
          subsenses: [],
        })),
      },
    ],
  });

  const normalizedSense = (index: number) => ({
    sourceSenseId: candidates[index].id,
    word: "cache",
    partOfSpeech: "noun",
    pronunciation: "/kæʃ/",
    meaningVi: `Nghĩa ${index + 1}`,
    meaningEn: `Meaning ${index + 1}`,
    example: `Example ${index + 1}.`,
    cefrLevel: index === 0 ? "B2" : "not-a-level",
  });

  it("accepts ranked senses, caps them at five, and normalizes CEFR", function () {
    const senses = normalizeVocabularyResponse(
      "cache",
      {
        senses: Array.from({ length: 6 }, (_, index) => normalizedSense(index)),
      },
      candidates,
    );
    assert.lengthOf(senses, 5);
    assert.equal(senses[0].cefrLevel, "B2");
    assert.equal(senses[1].cefrLevel, "unknown");
    assert.equal(senses[0].pronunciationSource, "dictionary");
  });

  it("rejects missing required fields", function () {
    const invalid = normalizedSense(0) as Record<string, unknown>;
    invalid.meaningVi = "";
    assert.throws(
      () =>
        normalizeVocabularyResponse("cache", { senses: [invalid] }, candidates),
      "meaningVi",
    );
  });

  it("rejects invented senses and changed words", function () {
    assert.throws(
      () =>
        normalizeVocabularyResponse(
          "cache",
          { senses: [{ ...normalizedSense(0), sourceSenseId: "invented" }] },
          candidates,
        ),
      "unknown sense",
    );
    assert.throws(
      () =>
        normalizeVocabularyResponse(
          "cache",
          { senses: [{ ...normalizedSense(0), word: "cash" }] },
          candidates,
        ),
      "changed the requested word",
    );
  });
});
