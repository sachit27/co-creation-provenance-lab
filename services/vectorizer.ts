// Simple Client-Side Vectorizer for Offline Support
// Uses TF-IDF concept restricted to top N terms for dimensions

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
      .filter(([term, count]) => count < stopWordThreshold || corpus.length < 5) // Keep all if small corpus
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, dimension)
      .map(e => e[0]);
      
    this.termIndex = new Map(sortedTerms.map((t, i) => [t, i]));
  }
  
  private tokenize(text: string): string[] {
    // Simple regex for words > 2 chars, ignoring numbers/symbols
    return text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
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
