/**
 * Deterministic sentence-like segmentation used by every source/summary path.
 * It is deliberately a documented proxy, not a claim of language-specific NLP.
 */
const ABBREVIATIONS = new Set([
  'e.g.', 'i.e.', 'etc.', 'vs.', 'cf.', 'al.', 'fig.', 'vol.',
  'dr.', 'mr.', 'mrs.', 'ms.', 'prof.', 'sr.', 'jr.',
  'inc.', 'ltd.', 'corp.', 'co.', 'no.', 'approx.',
]);

const isDecimalPoint = (line: string, index: number): boolean =>
  /\d/u.test(line[index - 1] ?? '') && /\d/u.test(line[index + 1] ?? '');

const isAbbreviationPoint = (line: string, index: number): boolean => {
  const prefix = line.slice(0, index + 1).toLocaleLowerCase();
  for (const abbreviation of ABBREVIATIONS) {
    if (prefix.endsWith(abbreviation)) return true;
  }
  // Personal initials such as "J. Smith" and acronym components such as "U.S.".
  const token = prefix.match(/(?:^|\s)([\p{L}](?:\.[\p{L}])*)\.$/u)?.[1];
  return !!token && token.length <= 5;
};

const splitLine = (line: string): string[] => {
  const units: string[] = [];
  let start = 0;
  let index = 0;
  while (index < line.length) {
    const character = line[index];
    const isNonLatinTerminator = /[。！？۔؟।॥]/u.test(character);
    const isLatinTerminator = /[.!?…]/u.test(character);
    if (!isNonLatinTerminator && !isLatinTerminator) {
      index++;
      continue;
    }
    if (character === '.' && (isDecimalPoint(line, index) || isAbbreviationPoint(line, index))) {
      index++;
      continue;
    }

    // Keep a run such as "?!" or "..." with the sentence it terminates.
    let end = index + 1;
    while (end < line.length && /[.!?…。！？۔؟।॥]/u.test(line[end])) end++;
    const unit = line.slice(start, end).trim();
    if (unit) units.push(unit);
    start = end;
    while (start < line.length && /\s/u.test(line[start])) start++;
    index = start;
  }
  const remainder = line.slice(start).trim();
  if (remainder) units.push(remainder);
  return units;
};

export const splitSentenceLikeUnits = (text: string): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const units = trimmed
    .split(/\r?\n+/u)
    .flatMap(line => splitLine(line.trim()))
    .filter(Boolean);
  return units.length > 0 ? units : [trimmed];
};
