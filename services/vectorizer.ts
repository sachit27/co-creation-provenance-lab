// Client-Side Vectorizer for Offline Support
// Uses TF-IDF concept restricted to top N terms for dimensions
//
// Supports multilingual tokenization via Unicode-aware segmentation:
// - Latin scripts: word-boundary splitting with stop-word filtering
// - CJK (Chinese/Japanese/Korean): character-level bigram segmentation
// - Arabic, Devanagari, Cyrillic, Thai, Hebrew, Greek: whitespace + punctuation splitting
//
// This ensures non-Latin inputs produce non-zero vectors, which is critical
// for equitable representation scoring when BGE-M3 is unavailable.

export class LocalVectorizer {
  private termIndex: Map<string, number>;
  private dimension: number;

  constructor(corpus: string[], dimension: number = 150) {
    this.dimension = dimension;

    // 1. Tokenize all docs
    const docs = corpus.map(t => this.tokenize(t));

    // 2. Count document frequency (DF)
    const docFreq: Record<string, number> = {};
    docs.forEach(words => {
      const uniqueWords = new Set(words);
      uniqueWords.forEach(w => {
        docFreq[w] = (docFreq[w] || 0) + 1;
      });
    });

    // 3. Select top terms to form the vector space dimensions
    // We filter out extremely common words (stop words proxy by high DF relative to corpus size) if corpus is large
    const stopWordThreshold = corpus.length * 0.9;

    const sortedTerms = Object.entries(docFreq)
      .filter(([, count]) => count < stopWordThreshold || corpus.length < 5) // Keep all if small corpus
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, dimension)
      .map(e => e[0]);

    this.termIndex = new Map(sortedTerms.map((t, i) => [t, i]));
  }

  /**
   * Unicode-aware tokenizer that handles Latin and non-Latin scripts.
   *
   * Strategy:
   * - Detect dominant script in the text
   * - Latin: word-boundary split, lowercase, filter short/stop words
   * - CJK: character bigrams (standard approach for unsegmented CJK text;
   *   see Nie et al., 2000 "Cross-Language Information Retrieval")
   * - Other scripts (Arabic, Devanagari, Cyrillic, Thai, Hebrew, Greek):
   *   split on whitespace and punctuation, filter by length
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];

    // Extract Latin-script words (>= 3 chars)
    const latinWords = text.toLowerCase().match(/\b[a-zA-Z\u00C0-\u024F]{3,}\b/g);
    if (latinWords) {
      tokens.push(...latinWords.map(w => w.toLowerCase()));
    }

    // Extract CJK character bigrams
    // CJK Unified Ideographs: U+4E00–U+9FFF
    // Hiragana: U+3040–U+309F, Katakana: U+30A0–U+30FF
    // Hangul: U+AC00–U+D7AF
    const cjkChars: string[] = [];
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3040 && code <= 0x30ff) ||
        (code >= 0xac00 && code <= 0xd7af)
      ) {
        cjkChars.push(char);
      }
    }
    // Create bigrams from CJK characters
    for (let i = 0; i < cjkChars.length - 1; i++) {
      tokens.push(cjkChars[i] + cjkChars[i + 1]);
    }
    // Also add individual CJK characters as unigrams (for short inputs)
    if (cjkChars.length > 0 && cjkChars.length <= 3) {
      tokens.push(...cjkChars);
    }

    // Extract Arabic tokens (U+0600–U+06FF)
    const arabicWords = text.match(/[\u0600-\u06FF]{2,}/g);
    if (arabicWords) tokens.push(...arabicWords);

    // Extract Devanagari tokens (U+0900–U+097F)
    const devanagariWords = text.match(/[\u0900-\u097F]{2,}/g);
    if (devanagariWords) tokens.push(...devanagariWords);

    // Extract Cyrillic tokens (U+0400–U+04FF)
    const cyrillicWords = text.match(/[\u0400-\u04FF]{2,}/g);
    if (cyrillicWords) tokens.push(...cyrillicWords.map(w => w.toLowerCase()));

    // Extract Thai tokens (U+0E00–U+0E7F) — Thai has no spaces between words,
    // so we use character trigrams (similar to CJK bigram approach)
    const thaiChars: string[] = [];
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code >= 0x0e00 && code <= 0x0e7f) {
        thaiChars.push(char);
      }
    }
    for (let i = 0; i < thaiChars.length - 2; i++) {
      tokens.push(thaiChars[i] + thaiChars[i + 1] + thaiChars[i + 2]);
    }

    // Extract Hebrew tokens (U+0590–U+05FF)
    const hebrewWords = text.match(/[\u0590-\u05FF]{2,}/g);
    if (hebrewWords) tokens.push(...hebrewWords);

    // Extract Greek tokens (U+0370–U+03FF)
    const greekWords = text.match(/[\u0370-\u03FF]{2,}/g);
    if (greekWords) tokens.push(...greekWords.map(w => w.toLowerCase()));

    return tokens;
  }

  public embed(text: string): number[] {
    const vec = new Array(this.dimension).fill(0);
    const words = this.tokenize(text);

    if (words.length === 0) return vec;

    // Calculate Term Frequency (TF) for this document
    words.forEach(w => {
      const idx = this.termIndex.get(w);
      if (idx !== undefined) {
        vec[idx] += 1;
      }
    });

    // Normalize vector (Cosine normalization) -> allows dot product to equal cosine similarity
    const magnitude = Math.sqrt(vec.reduce((acc, val) => acc + val * val, 0));

    if (magnitude === 0) return vec;
    return vec.map(v => v / magnitude);
  }
}
