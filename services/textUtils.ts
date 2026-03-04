// A lightweight client-side Keyword/Concept extractor
// In a production app, this would be a real NLP library or API call.
// Here we use heuristic frequency analysis and stopword filtering.

const STOP_WORDS = new Set([
  // Articles & Determinants
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'any', 'all', 'some', 'every', 'each', 'no', 'another', 'other',
  // Pronouns & Prepositions
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'us', 'them', 'who', 'whom', 'whose', 'which', 'what', 'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'yourselves', 'themselves',
  'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'of', 'about', 'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around', 'among',
  'and', 'but', 'or', 'so', 'yet', 'nor', 'because', 'although', 'since', 'if', 'unless', 'when', 'where', 'while', 'how', 'therefore', 'however', 'thus',
  // Verbs & State of Being (Expanded)
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'done',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'go', 'goes', 'went', 'gone', 'going',
  'get', 'gets', 'got', 'gotten', 'getting',
  'make', 'makes', 'made', 'making',
  'take', 'takes', 'took', 'taken', 'taking',
  'come', 'comes', 'came', 'coming',
  'say', 'says', 'said', 'saying',
  'see', 'sees', 'saw', 'seen', 'seeing',
  'know', 'knows', 'knew', 'known', 'knowing',
  'think', 'thinks', 'thought', 'thinking',
  'look', 'looks', 'looked', 'looking',
  'want', 'wants', 'wanted', 'wanting',
  'give', 'gives', 'gave', 'given', 'giving',
  'use', 'uses', 'used', 'using',
  'find', 'finds', 'found', 'finding',
  'tell', 'tells', 'told', 'telling',
  'ask', 'asks', 'asked', 'asking',
  'seem', 'seems', 'seemed', 'seeming',
  'feel', 'feels', 'felt', 'feeling',
  'try', 'tries', 'tried', 'trying',
  'leave', 'leaves', 'left', 'leaving',
  'call', 'calls', 'called', 'calling',
  'need', 'needs', 'needed', 'needing',
  'become', 'becomes', 'became', 'becoming',
  'put', 'puts', 'putting',
  'mean', 'means', 'meant', 'meaning',
  'keep', 'keeps', 'kept', 'keeping',
  'let', 'lets', 'letting',
  'begin', 'begins', 'began', 'beginning',
  'help', 'helps', 'helped', 'helping',
  'start', 'starts', 'started', 'starting',
  'run', 'runs', 'ran', 'running',
  'move', 'moves', 'moved', 'moving',
  'live', 'lives', 'lived', 'living',
  'believe', 'believes', 'believed', 'believing',
  'bring', 'brings', 'brought', 'bringing',
  'happen', 'happens', 'happened', 'happening',
  'provide', 'provides', 'provided', 'providing',
  'include', 'includes', 'included', 'including',
  'continue', 'continues', 'continued', 'continuing',
  'set', 'sets', 'setting',
  'learn', 'learns', 'learned', 'learning',
  'change', 'changes', 'changed', 'changing',
  'lead', 'leads', 'led', 'leading',
  'understand', 'understands', 'understood', 'understanding',
  'follow', 'follows', 'followed', 'following',
  'stop', 'stops', 'stopped', 'stopping',
  'create', 'creates', 'created', 'creating',
  'allow', 'allows', 'allowed', 'allowing',
  'add', 'adds', 'added', 'adding',
  'spend', 'spends', 'spent', 'spending',
  'grow', 'grows', 'grew', 'growing',
  'open', 'opens', 'opened', 'opening',
  'walk', 'walks', 'walked', 'walking',
  'win', 'wins', 'won', 'winning',
  'offer', 'offers', 'offered', 'offering',
  'remember', 'remembers', 'remembered', 'remembering',
  'love', 'loves', 'loved', 'loving',
  'consider', 'considers', 'considered', 'considering',
  'appear', 'appears', 'appeared', 'appearing',
  'buy', 'buys', 'bought', 'buying',
  'serve', 'serves', 'served', 'serving',
  'send', 'sends', 'sent', 'sending',
  'expect', 'expects', 'expected', 'expecting',
  'build', 'builds', 'built', 'building',
  'stay', 'stays', 'stayed', 'staying',
  'fall', 'falls', 'fell', 'falling',
  'cut', 'cuts', 'cutting',
  'reach', 'reaches', 'reached', 'reaching',
  'kill', 'kills', 'killed', 'killing',
  'remain', 'remains', 'remained', 'remaining',
  // Adverbs & Common Terms
  'not', "n't", 'never', 'always', 'often', 'sometimes', 'usually', 'really', 'very', 'too', 'quite', 'just', 'only', 'almost', 'also', 'even', 'then', 'now', 'there', 'here', 'back', 'up', 'down', 'away', 'off', 'still', 'maybe', 'perhaps',
  'good', 'bad', 'great', 'new', 'old', 'first', 'last', 'long', 'little', 'own', 'same', 'big', 'high', 'low', 'different', 'small', 'large', 'next', 'early', 'young', 'important', 'few', 'many', 'much', 'part', 'way', 'day', 'year', 'thing', 'things', 'something', 'anything', 'nothing', 'everything',
  // Domain Specific Generic Words (Context: User Feedback/App)
  'participant', 'participants', 'user', 'users', 'citizen', 'project', 'research', 'researcher', 'researchers', 'study', 'studies', 'analysis', 'data', 'contribution', 'input', 'feedback', 'app', 'tool', 'system',
  // --- FIX: Contractions stripped of apostrophes ---
  // When apostrophes are removed for tokenization, "don't" → "dont", "can't" → "cant", etc.
  // These are meaningless without context and MUST be in the stoplist.
  'dont', 'cant', 'wont', 'shouldnt', 'wouldnt', 'couldnt', 'doesnt', 'didnt',
  'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt', 'wont',
  'mustnt', 'neednt', 'oughtnt', 'shant', 'shan', 'mightnt', 'ive', 'youve',
  'weve', 'theyve', 'id', 'youd', 'hed', 'shed', 'wed', 'theyd',
  'im', 'youre', 'hes', 'shes', 'were', 'theyre', 'ive', 'isnt', 'it',
  'ill', 'youll', 'hell', 'shell', 'well', 'theyll', 'thats', 'whos',
  'whats', 'wheres', 'hows', 'theres', 'its', 'lets',
  // Also common contracted forms after stemming
  'shouldnt', 'wouldnt', 'aint', 'reckon', 'gonna', 'wanna', 'gotta',
]);

/**
 * Generic high-frequency words that survive stop-word filtering but are
 * semantically empty when shown as standalone topic labels.
 * These are word-level placeholders (not phrases) that appear in every
 * discussion but don't identify any real theme without context.
 */
const GENERIC_WORDS = new Set([
  'people', 'person', 'more', 'less', 'real', 'show', 'focus', 'address',
  'ensure', 'honest', 'actually', 'already', 'increase', 'decrease',
  'again', 'rather', 'question', 'issues', 'issue', 'better', 'worse',
  'again', 'true', 'false', 'sure', 'think', 'believe', 'clearly',
  'rather', 'simply', 'basically', 'given', 'being', 'having',
  'everyone', 'anyone', 'someone', 'nobody', 'everybody',
]);


const cleanAndStem = (w: string): string | null => {
  // 1. Length Check — require at least 4 chars to avoid 3-letter noise
  if (w.length < 4) return null;

  // 2. Reject tokens that still contain apostrophes (contractions)
  if (w.includes("'")) return null;

  // 3. Reject purely numeric tokens
  if (/^\d+$/.test(w)) return null;

  // 4. Stoplist Check
  if (STOP_WORDS.has(w)) return null;

  // 3. Simple Stemming (Improved)
  let stem = w;

  // Order matters: checks specific suffixes first
  if (stem.endsWith('ing')) {
    stem = stem.slice(0, -3);
  } else if (stem.endsWith('ly')) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('ies') && stem.length > 4) {
    // "countries" -> "country", "cities" -> "city"
    stem = stem.slice(0, -3) + 'y';
  } else if (stem.endsWith('es') && !stem.endsWith('ss') && stem.length > 4) {
    // "focuses" -> "focus", "buses" -> "bus"
    // But exclude "analysis" (is->i), "mess"? No.
    // Heuristic: if penultimate char is s, probably 'ses' -> 's'
    if (stem.endsWith('ses')) {
      stem = stem.slice(0, -2); // "focuses" -> "focus", "buses" -> "bus"
    } else {
      stem = stem.slice(0, -2); // "boxes" -> "box"
    }
  } else if (stem.endsWith('s') && !stem.endsWith('ss') && !stem.endsWith('us') && !stem.endsWith('is')) {
    // "cats" -> "cat". 
    // Exclude "focus" (us), "analysis" (is), "process" (ss)
    stem = stem.slice(0, -1);
  } else if (stem.endsWith('ed')) {
    stem = stem.slice(0, -2);
  }

  // 4. Post-Stem Check
  if (stem.length < 3 || STOP_WORDS.has(stem)) return null;
  return stem;
};

/**
 * RAKE — Rapid Automatic Keyword Extraction (Rose et al. 2010)
 *
 * How it works:
 * 1. Normalize text: strip apostrophes (so contractions become stop-tokens),
 *    lowercase, replace punctuation with delimiters.
 * 2. Split on stop-word / generic-word / punctuation boundaries to form
 *    *candidate phrases* (runs of consecutive content words).
 * 3. Score each candidate using word co-occurrence degree:
 *      phrase_score = Σ( degree(w) / freq(w) )  for w in phrase
 *    where degree(w) = number of distinct content words w co-occurs with
 *    across ALL phrases, and freq(w) = total occurrences of w.
 *    This favours words that appear with many other content words (rich
 *    phrases) over words that appear alone (noise words).
 * 4. De-duplicate by checking if one candidate is a sub-phrase of a higher-
 *    ranked one; if so, skip the shorter variant.
 * 5. Return the top-max phrases, each ≤ 4 words.
 *
 * Advantages over TF-IDF:
 *   • Naturally produces multi-word keyphrases ("regulatory compliance")
 *   • Robust on short texts (no corpus frequency needed)
 *   • No external dependencies
 */
export const extractKeywords = (text: string, max: number = 8): string[] => {
  // --- 1. Normalize --------------------------------------------------------
  const normalized = text
    .toLowerCase()
    .replace(/[\u2018\u2019\u0027]/g, '')      // strip all apostrophe variants
    .replace(/[.,\/#!$%\^&\*;:{}=\\\-_`~()\"\?\[\]]/g, ' | ')  // punctuation → delimiter
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = normalized.split(' ');

  // --- 2. Build candidate phrases ------------------------------------------
  // A "delimiter" is any stop word, generic word, the pipe symbol, or a token
  // shorter than 3 characters.
  const isDelimiter = (t: string): boolean =>
    t === '|' || t.length < 3 || STOP_WORDS.has(t) || GENERIC_WORDS.has(t);

  const candidates: string[][] = [];  // each candidate is an array of words
  let current: string[] = [];

  for (const tok of tokens) {
    if (isDelimiter(tok)) {
      if (current.length > 0) {
        candidates.push(current);
        current = [];
      }
    } else {
      current.push(tok);
    }
  }
  if (current.length > 0) candidates.push(current);

  // --- 3. Compute word scores (degree / frequency) -------------------------
  const wordFreq: Record<string, number> = {};
  const wordDegree: Record<string, number> = {};

  for (const phrase of candidates) {
    const phraseLen = phrase.length;
    for (const w of phrase) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
      // degree = freq + (number of OTHER content words it co-occurs with)
      // Simplified: degree += phrase length (includes self, consistent with Rose et al.)
      wordDegree[w] = (wordDegree[w] || 0) + phraseLen;
    }
  }

  const wordScore: Record<string, number> = {};
  for (const w of Object.keys(wordFreq)) {
    wordScore[w] = (wordDegree[w] || 0) / wordFreq[w];
  }

  // --- 4. Score each candidate phrase, cap length at 4 words ----------------
  const phraseScores: { phrase: string; score: number }[] = [];
  const seen = new Set<string>();

  for (const words of candidates) {
    // Cap at 4 content words to keep labels readable
    const trimmed = words.slice(0, 4);
    const phrase = trimmed.join(' ');
    if (seen.has(phrase) || phrase.length < 4) continue;
    seen.add(phrase);

    const score = trimmed.reduce((sum, w) => sum + (wordScore[w] || 0), 0);
    phraseScores.push({ phrase, score });
  }

  // Sort by score descending
  phraseScores.sort((a, b) => b.score - a.score);

  // --- 5. De-duplicate sub-phrases -----------------------------------------
  const results: string[] = [];
  for (const { phrase } of phraseScores) {
    if (results.length >= max) break;
    // Skip if this phrase is a substring of an already-selected higher-ranked one
    const dominated = results.some(r => r.includes(phrase) || phrase.includes(r));
    if (!dominated) {
      results.push(phrase);
    }
  }

  return results;
};

/**
 * Legacy TF-IDF keyword extractor — kept as fallback for computeConceptOverlapScore
 * which relies on unigram stem matching against the summary.
 */
export const extractKeywordsLegacy = (text: string, max: number = 8): string[] => {
  const words = text.toLowerCase()
    .replace(/[\u2018\u2019\u0027]/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\\\-_`~()\"]/g, ' ')
    .split(/\s+/);

  const freq: Record<string, number> = {};
  const stemToOriginal: Record<string, string> = {};

  words.forEach(w => {
    if (w.length < 5) return;
    if (GENERIC_WORDS.has(w)) return;
    const stem = cleanAndStem(w);
    if (stem && !GENERIC_WORDS.has(stem)) {
      freq[stem] = (freq[stem] || 0) + 1;
      if (!stemToOriginal[stem]) stemToOriginal[stem] = w;
    }
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([stem]) => stemToOriginal[stem] ?? stem);
};

// Returns concepts found in input that are MISSING from summary
// Returns concepts found in input that are MISSING from summary
// Uses robust matching strategies (exact, stem, fuzzy) to avoid false negatives
export const analyzeConceptGap = (input: string, summary: string): { kept: string[], dropped: string[] } => {
  // Extract substantive concepts (Top 10)
  const inputKeywords = extractKeywords(input, 10);
  const summaryLower = summary.toLowerCase();

  // Pre-compute summary stems for efficiency
  const summaryWords = new Set(
    summaryLower
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
      .split(/\s+/)
      .map(w => cleanAndStem(w))
      .filter((w): w is string => w !== null)
  );

  const kept: string[] = [];
  const dropped: string[] = [];

  for (const kw of inputKeywords) {
    let captured = false;

    // Strategy 1: Direct substring match
    if (summaryLower.includes(kw)) {
      captured = true;
    }
    // Strategy 2: Stem match (e.g. "focuses" matches "focus")
    else {
      const stem = cleanAndStem(kw);
      if (stem && summaryWords.has(stem)) {
        captured = true;
      }
      // Strategy 3: Multi-word concept check
      else if (kw.includes(' ')) {
        const parts = kw.split(' ');
        // Check if all significant parts are present (approximate match)
        const partsFound = parts.filter(part => {
          const partStem = cleanAndStem(part);
          return summaryLower.includes(part) || (partStem && summaryWords.has(partStem));
        });

        // If > 60% of words are found, consider it captured
        if (partsFound.length / parts.length > 0.6) {
          captured = true;
        }
      }
    }

    if (captured) kept.push(kw);
    else dropped.push(kw);
  }

  return { kept, dropped };
};

/**
 * Compute concept overlap score between participant input and summary.
 * Uses fuzzy matching to handle word order variations and partial matches.
 *
 * @returns Score between 0-1 representing what fraction of key concepts are captured
 */
export const computeConceptOverlapScore = (input: string, summary: string): number => {
  const inputKeywords = extractKeywords(input, 8);
  if (inputKeywords.length === 0) return 0.5; // No keywords = neutral score

  const summaryLower = summary.toLowerCase();
  const summaryWords = new Set(
    summaryLower
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
      .split(/\s+/)
      .map(w => cleanAndStem(w))
      .filter((w): w is string => w !== null)
  );

  let matchedScore = 0;

  for (const keyword of inputKeywords) {
    // Check 1: Direct substring match
    if (summaryLower.includes(keyword)) {
      matchedScore += 1;
      continue;
    }

    // Check 2: Stem match (handles "crashing" vs "crash", "frequently" vs "frequent")
    const keywordStem = cleanAndStem(keyword);
    if (keywordStem && summaryWords.has(keywordStem)) {
      matchedScore += 0.9; // Slightly lower for stem match
      continue;
    }

    // Check 3: For bigrams, check if both words appear (even if not adjacent)
    // "crashes frequently" should match "frequently crashing apps"
    if (keyword.includes(' ')) {
      const parts = keyword.split(' ');
      const partsFound = parts.filter(part => {
        const partStem = cleanAndStem(part);
        return summaryLower.includes(part) || (partStem && summaryWords.has(partStem));
      });
      if (partsFound.length === parts.length) {
        matchedScore += 0.85; // Both parts found
        continue;
      } else if (partsFound.length > 0) {
        matchedScore += 0.4 * (partsFound.length / parts.length); // Partial match
        continue;
      }
    }

    // Check 4: Fuzzy single-word match (Levenshtein-like for typos/variations)
    const keywordParts = keyword.split(' ');
    for (const part of keywordParts) {
      if (part.length >= 4) {
        // Check if any summary word starts with same 4+ chars
        const prefix = part.slice(0, Math.min(4, part.length));
        for (const summaryWord of summaryWords) {
          if (summaryWord && summaryWord.startsWith(prefix) && summaryWord.length >= 3) {
            matchedScore += 0.5;
            break;
          }
        }
      }
    }
  }

  return Math.min(1, matchedScore / inputKeywords.length);
};

export const computeConceptFidelity = (inputs: string[], summary: string) => {
  const allInputConcepts = new Set<string>();
  const summaryConcepts = extractKeywords(summary, 20); // Get top summary concepts

  let totalInputConcepts = 0;
  let retainedCount = 0;

  const participantMap: Record<string, { kept: string[], dropped: string[] }> = {};

  inputs.forEach((text, idx) => {
    const gap = analyzeConceptGap(text, summary);
    gap.kept.forEach(c => allInputConcepts.add(c));
    gap.dropped.forEach(c => allInputConcepts.add(c));

    totalInputConcepts += (gap.kept.length + gap.dropped.length);
    retainedCount += gap.kept.length;

    participantMap[idx] = gap;
  });

  // Added concepts = concepts in summary that weren't present in any input.
  // Use stemmed matching (via analyzeConceptGap) rather than simple includes()
  // to avoid false positives from morphological variants.
  const flatInputText = inputs.join(' ');
  const addedConcepts: string[] = [];
  summaryConcepts.forEach(sc => {
    // Treat the summary concept as "input" and inputs as "summary" —
    // if the concept is "kept" (found in inputs), it's not hallucinated.
    const check = analyzeConceptGap(sc, flatInputText);
    if (check.kept.length === 0) {
      addedConcepts.push(sc);
    }
  });

  // Categorise all unique concepts using the same stemmed/fuzzy matching
  // as analyzeConceptGap to ensure consistency.
  const allConceptsArray = Array.from(allInputConcepts);
  const preservedConcepts: string[] = [];
  const droppedConcepts: string[] = [];

  for (const concept of allConceptsArray) {
    const check = analyzeConceptGap(concept, summary);
    if (check.kept.length > 0) {
      preservedConcepts.push(concept);
    } else {
      droppedConcepts.push(concept);
    }
    if (preservedConcepts.length >= 20 && droppedConcepts.length >= 20) break;
  }
  // Trim to max 20 each
  preservedConcepts.splice(20);
  droppedConcepts.splice(20);

  return {
    preservedConcepts,
    droppedConcepts,
    addedConcepts,
    fidelityScore: totalInputConcepts === 0 ? 0 : retainedCount / totalInputConcepts,
    participantMap
  };
};
