const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export function isSingleWordText(text: string) {
  let wordCount = 0;
  for (const segment of segmenter.segment(text.trim())) {
    if (segment.isWordLike && ++wordCount > 1) return false;
  }
  return wordCount === 1;
}
