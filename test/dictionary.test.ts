import {
  buildMeaningCandidatePool,
  fallbackVocabularySenses,
  flattenDictionaryEntries,
} from "../src/modules/dictionary/model";

describe("FreeDictionaryAPI vocabulary parser", function () {
  const payload = {
    word: "thread",
    entries: [
      {
        partOfSpeech: "noun",
        pronunciations: [{ type: "ipa", text: "/θɹɛd/", tags: ["US"] }],
        synonyms: [],
        antonyms: [],
        senses: [
          {
            definition: "A long, thin strand of cotton.",
            tags: [],
            examples: ["A loose thread hung from the shirt."],
            synonyms: ["strand"],
            antonyms: [],
            subsenses: [],
          },
          {
            definition: "A sequence of connected messages.",
            tags: ["Internet"],
            examples: [],
            synonyms: [],
            antonyms: [],
            subsenses: [
              {
                definition:
                  "A unit of execution scheduled by an operating system.",
                tags: ["computing"],
                examples: [],
                synonyms: [],
                antonyms: [],
                subsenses: [],
              },
            ],
          },
          {
            definition: "An obsolete style of clothing.",
            tags: ["obsolete"],
            examples: [],
            synonyms: [],
            antonyms: [],
            subsenses: [],
          },
        ],
      },
    ],
    source: {
      url: "https://en.wiktionary.org/wiki/thread",
      license: { name: "CC BY-SA 4.0" },
    },
  };

  it("flattens nested senses while retaining parent context", function () {
    const senses = flattenDictionaryEntries(payload);
    assert.lengthOf(senses, 4);
    assert.equal(new Set(senses.map((sense) => sense.id)).size, 4);
    assert.isTrue(senses.every((sense) => sense.id.startsWith("sense-")));
    assert.equal(senses[2].depth, 1);
    assert.equal(senses[2].parentDefinition, senses[1].definition);
    assert.equal(senses[2].pronunciations[0].text, "/θɹɛd/");
  });

  it("keeps sense ids stable when top-level meanings are reordered", function () {
    const reordered = JSON.parse(JSON.stringify(payload));
    reordered.entries[0].senses.reverse();
    assert.deepEqual(
      flattenDictionaryEntries(reordered)
        .map((sense) => sense.id)
        .sort(),
      flattenDictionaryEntries(payload)
        .map((sense) => sense.id)
        .sort(),
    );
  });

  it("keeps computing senses and excludes obsolete candidates", function () {
    const pool = buildMeaningCandidatePool(flattenDictionaryEntries(payload));
    assert.isTrue(pool.some((sense) => sense.tags.includes("computing")));
    assert.isFalse(pool.some((sense) => sense.tags.includes("obsolete")));
  });

  it("falls back to at most two distinct useful meanings", function () {
    const selected = fallbackVocabularySenses(
      flattenDictionaryEntries(payload),
    );
    assert.lengthOf(selected, 2);
    assert.equal(selected[0].reason, "daily");
    assert.equal(selected[1].reason, "academic-cs");
    assert.notEqual(selected[0].id, selected[1].id);
  });
});
