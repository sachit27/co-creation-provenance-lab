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
  'not', 'n\'t', 'never', 'always', 'often', 'sometimes', 'usually', 'really', 'very', 'too', 'quite', 'just', 'only', 'almost', 'also', 'even', 'then', 'now', 'there', 'here', 'back', 'up', 'down', 'away', 'off', 'still', 'maybe', 'perhaps',
  'good', 'bad', 'great', 'new', 'old', 'first', 'last', 'long', 'little', 'own', 'same', 'big', 'high', 'low', 'different', 'small', 'large', 'next', 'early', 'young', 'important', 'few', 'many', 'much', 'part', 'way', 'day', 'year', 'thing', 'things', 'something', 'anything', 'nothing', 'everything',
  // Domain Specific Generic Words (Context: User Feedback/App)
  'participant', 'participants', 'user', 'users', 'citizen', 'project', 'research', 'researcher', 'researchers', 'study', 'studies', 'analysis', 'data', 'contribution', 'input', 'feedback', 'app', 'tool', 'system'
]);

const cleanAndStem = (w: string): string | null => {
  // 1. Length Check
  if (w.length < 3) return null;

  // 2. Stoplist Check
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

export const extractKeywords = (text: string, max: number = 8): string[] => {
  const words = text.toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .split(/\s+/);

  const freq: Record<string, number> = {};
  const stemmedWords: (string | null)[] = words.map(cleanAndStem);

  // 1. Unigram Extraction
  stemmedWords.forEach(w => {
    if (w) freq[w] = (freq[w] || 0) + 1;
  });

  // 2. Bigram Extraction (Phrases)
  // This helps capture "public transport", "climate change", "mobile app"
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    // For bigrams, we check the raw words against stoplist, but don't stem aggressively yet
    if (!STOP_WORDS.has(w1) && !STOP_WORDS.has(w2) && w1.length > 2 && w2.length > 2) {
      const bigram = `${w1} ${w2}`;
      // Weight bigrams slightly higher than unigrams, but don't let them dominate unless frequent
      freq[bigram] = (freq[bigram] || 0) + 1.2;
    }
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1]) // Sort by frequency desc
    .slice(0, max)
    .map(([w]) => w);
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
