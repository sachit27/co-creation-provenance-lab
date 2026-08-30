/**
 * Data Preprocessor
 *
 * Cleans and validates raw participant input before analysis.
 * Handles the messy realities of real-world consultation data:
 * missing values, junk text, multi-column surveys, encoding artefacts,
 * delimiter variants, and duplicate IDs.
 */

import { ParticipantInput, StakeholderGroup, ColumnInfo, ColumnSelection, MultiColumnMode } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DropReason =
  | 'missing_value'    // NA, null, blank, no response
  | 'too_short'        // Fewer than 10 meaningful characters
  | 'no_content'       // All punctuation, numbers, or repeated characters
  | 'duplicate_id';    // Same ID appeared more than once

export interface DroppedRow {
  originalId: string;
  originalText: string;
  reason: DropReason;
}

export interface PreprocessReport {
  totalRows: number;
  keptRows: number;
  droppedRows: DroppedRow[];
  duplicateIdsMerged: string[];   // IDs that were deduplicated
  multiColumnsMerged: boolean;    // True if multiple text columns were concatenated
  separatorDetected: ',' | ';' | '\t';
  bomStripped: boolean;
}

export interface PreprocessResult {
  inputs: ParticipantInput[];
  report: PreprocessReport;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Strings treated as "no response" regardless of case
const NULL_PATTERNS = new Set([
  'na', 'n/a', 'n.a', 'n.a.', 'null', 'nil', '-', '--', '---',
  '.', '..', '...', '….', 'no response', 'no answer',
  'not applicable', 'skip', 'skipped', 'blank', 'empty',
]);

// Short answers, numbers, refusals, and uncertainty can be substantive survey
// evidence. Only truly empty/punctuation-only values are removed automatically.
const MIN_CONTENT_CHARS = 1;

// ─── Delimiter detection ──────────────────────────────────────────────────────

export const detectDelimiter = (text: string): ',' | ';' | '\t' => {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) break;
    if (!inQuotes && (char === ',' || char === ';' || char === '\t')) counts[char]++;
  }
  if (counts[';'] > counts[','] && counts[';'] > counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return ',';
};

// ─── CSV row parser (handles quoted fields for any delimiter) ─────────────────

export const parseDelimitedRecords = (text: string, delimiter: string): string[][] => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  const finishRecord = () => {
    record.push(field.trim());
    field = '';
    if (record.some(cell => cell.length > 0)) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      record.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRecord();
    } else {
      field += char;
    }
  }
  if (inQuotes) throw new Error('Malformed delimited file: unterminated quoted field.');
  if (field.length > 0 || record.length > 0) finishRecord();
  return records;
};

export const parseRow = (row: string, delimiter: string): string[] =>
  parseDelimitedRecords(row, delimiter)[0] ?? [];

// ─── Content quality checks ───────────────────────────────────────────────────

const isMissingValue = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) return true;
  if (NULL_PATTERNS.has(normalized)) return true;
  // Also catch things like "N/A", "N.A." with punctuation
  if (/^[n][/\\.][a]\.?$/i.test(normalized)) return true;
  return false;
};

const isTooShort = (text: string): boolean => {
  const meaningful = text.replace(/[\s\p{P}\p{S}]/gu, '');
  return meaningful.length < MIN_CONTENT_CHARS;
};

const hasNoContent = (text: string): boolean => {
  // All same character repeated (e.g., "aaaaaaa", "........")
  const stripped = text.trim();
  if (stripped.length > 3 && new Set(stripped.toLowerCase()).size <= 2) return true;
  // Only punctuation/symbols
  if (/^[\s\p{P}\p{S}]+$/u.test(stripped)) return true;
  return false;
};

// ─── Column detection ─────────────────────────────────────────────────────────

interface ColumnMapping {
  idColumn: number | null;
  textColumns: number[];     // May be multiple — will be concatenated
  groupColumn: number | null;
  hasHeaders: boolean;
  headers: string[];
}

const ID_PATTERNS = ['id', 'participant_id', 'participant', 'user_id', 'user', 'respondent', 'name', 'ref'];
const TEXT_PATTERNS = ['text', 'contribution', 'feedback', 'input', 'response', 'comment', 'content', 'message', 'answer', 'q', 'question'];
const GROUP_PATTERNS = ['group', 'stakeholder', 'category', 'type', 'role', 'affiliation', 'sector', 'org'];

export const detectColumns = (headerRow: string, delimiter: ',' | ';' | '\t'): ColumnMapping => {
  const headers = parseRow(headerRow, delimiter).map(h => h.toLowerCase().trim());

  const idColumn = (() => {
    const idx = headers.findIndex(h => ID_PATTERNS.some(p => h === p || h.startsWith(p)));
    return idx !== -1 ? idx : null;
  })();

  // Collect ALL columns that look like text/question columns — real surveys often have Q1..Qn
  const textColumns = headers.reduce<number[]>((acc, h, i) => {
    if (i === idColumn) return acc;
    if (GROUP_PATTERNS.some(p => h.includes(p))) return acc;
    // Named text columns
    if (TEXT_PATTERNS.some(p => h.includes(p))) { acc.push(i); return acc; }
    // Q-numbered columns: q1, q2, question_1, …
    if (/^q\d+$/.test(h) || /^question[_\s]?\d+$/.test(h) || /^item[_\s]?\d+$/.test(h)) {
      acc.push(i); return acc;
    }
    return acc;
  }, []);

  // Fallback: if nothing matched, treat column after ID as text
  if (textColumns.length === 0) {
    const fallback = idColumn !== null ? (idColumn === 0 ? 1 : 0) : (headers.length > 1 ? 1 : 0);
    textColumns.push(fallback);
  }

  const groupColumn = (() => {
    const idx = headers.findIndex(h => GROUP_PATTERNS.some(p => h.includes(p)));
    return idx !== -1 ? idx : null;
  })();

  const hasHeaders = idColumn !== null || textColumns.length > 0;

  return { idColumn, textColumns, groupColumn, hasHeaders, headers };
};

// ─── Stakeholder group mapping ────────────────────────────────────────────────

const GROUP_MAP: Record<string, StakeholderGroup> = {
  community: 'community', citizen: 'community', resident: 'community', public: 'community',
  expert: 'expert', professional: 'expert', scientist: 'expert', researcher: 'expert',
  youth: 'youth', student: 'youth', young: 'youth',
  government: 'government', official: 'government', policy: 'government', municipal: 'government',
  business: 'business', company: 'business', corporate: 'business',
  ngo: 'community', nonprofit: 'community', 'non-profit': 'community',
  other: 'other',
};

export const parseGroup = (raw: string): StakeholderGroup | undefined => {
  if (!raw) return undefined;
  const normalized = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(GROUP_MAP)) {
    if (normalized.includes(key)) return val;
  }
  return normalized.length > 0 ? 'other' : undefined;
};

// ─── Main preprocessor ────────────────────────────────────────────────────────

/**
 * Full preprocessing pipeline for CSV text.
 * Returns cleaned ParticipantInput array + a human-readable report.
 */
export const preprocessCSV = (rawText: string): PreprocessResult => {
  const dropped: DroppedRow[] = [];
  const duplicateIdsMerged: string[] = [];

  // 1. Strip UTF-8 BOM (common in Excel CSV exports)
  const bomStripped = rawText.startsWith('\uFEFF');
  const text = bomStripped ? rawText.slice(1) : rawText;

  const separator = detectDelimiter(text);
  const records = parseDelimitedRecords(text, separator);
  if (records.length === 0) {
    return {
      inputs: [],
      report: {
        totalRows: 0, keptRows: 0, droppedRows: [],
        duplicateIdsMerged: [], multiColumnsMerged: false,
        separatorDetected: ',', bomStripped,
      },
    };
  }

  const firstRow = records[0];
  const hasHeaders = looksLikeHeader(firstRow);
  const mapping = hasHeaders
    ? detectColumns(firstRow.map(cell => `"${cell.replace(/"/g, '""')}"`).join(separator), separator)
    : {
        idColumn: firstRow.length > 1 ? 0 : null,
        textColumns: [firstRow.length > 1 ? 1 : 0],
        groupColumn: null,
        hasHeaders: false,
        headers: firstRow.map((_, index) => `Column ${index + 1}`),
      };
  const dataRecords = hasHeaders ? records.slice(1) : records;
  const totalRows = dataRecords.length;
  const multiColumnsMerged = mapping.textColumns.length > 1;

  // 5. Parse rows
  const seenIds = new Map<string, number>(); // id → count
  const rawParsed: Array<{ id: string; text: string; group?: StakeholderGroup } | null> = dataRecords.map((parts, i) => {
    if (parts.length === 0) return null;

    // Extract ID
    const rawId = mapping.idColumn !== null
      ? (parts[mapping.idColumn]?.trim() ?? '')
      : '';
    const id = rawId.length > 0 ? rawId : `Row_${i + 1}`;

    // Extract and concatenate text columns
    const textParts = mapping.textColumns
      .map(col => parts[col]?.trim() ?? '')
      .filter(t => t.length > 0 && !isMissingValue(t));
    const text = textParts.join(' | ');

    // Extract group
    const group = mapping.groupColumn !== null
      ? parseGroup(parts[mapping.groupColumn] ?? '')
      : undefined;

    return { id, text, group };
  });

  // 6. Quality filtering
  const candidates = rawParsed.map((row, i) => {
    if (!row) return null;
    const originalText = row.text;

    if (isMissingValue(originalText)) {
      dropped.push({ originalId: row.id, originalText, reason: 'missing_value' });
      return null;
    }
    if (hasNoContent(originalText)) {
      dropped.push({ originalId: row.id, originalText, reason: 'no_content' });
      return null;
    }
    if (isTooShort(originalText)) {
      dropped.push({ originalId: row.id, originalText, reason: 'too_short' });
      return null;
    }

    return row;
  }).filter((r): r is { id: string; text: string; group?: StakeholderGroup } => r !== null);

  // 7. Deduplicate IDs — if same ID appears twice, append _2, _3…
  const inputs: ParticipantInput[] = candidates.map(row => {
    const count = (seenIds.get(row.id) ?? 0) + 1;
    seenIds.set(row.id, count);

    let finalId = row.id;
    if (count > 1) {
      finalId = `${row.id}_${count}`;
      if (!duplicateIdsMerged.includes(row.id)) duplicateIdsMerged.push(row.id);
      dropped.push({ originalId: row.id, originalText: row.text, reason: 'duplicate_id' });
      // Still keep the row — just rename it. Remove the erroneous drop entry.
      dropped.pop();
    }

    const input: ParticipantInput = { id: finalId, text: row.text };
    if (row.group) input.group = row.group;
    return input;
  });

  return {
    inputs,
    report: {
      totalRows,
      keptRows: inputs.length,
      droppedRows: dropped,
      duplicateIdsMerged,
      multiColumnsMerged,
      separatorDetected: separator,
      bomStripped,
    },
  };
};

// ─── Column Scanner ───────────────────────────────────────────────────────────

/**
 * Heuristic: does the first row of the CSV look like column headers?
 *
 * Headers are typically short labels like "ID", "Comment", "Group".
 * Data rows tend to have numeric IDs, long text, or no recognisable label patterns.
 */
export const looksLikeHeader = (cells: string[]): boolean => {
  if (cells.length === 0) return false;

  // If every cell is purely numeric, it's almost certainly data (e.g., ID, score)
  if (cells.every(c => /^\d+$/.test(c.trim()))) return false;

  // If average cell length is very long (>80 chars), it's data not labels
  const avgLen = cells.reduce((s, c) => s + c.trim().length, 0) / cells.length;
  if (avgLen > 80) return false;

  // If at least one cell matches a known header keyword, it's a header row
  const ALL_PATTERNS = [...ID_PATTERNS, ...TEXT_PATTERNS, ...GROUP_PATTERNS,
    'name', 'email', 'date', 'timestamp', 'column', 'field', 'value', 'score',
    'age', 'gender', 'location', 'city', 'country', 'how', 'what', 'why', 'which',
    'internal', 'ref', 'number', 'num', 'serial', 'respondent'];
  const hasKnownLabel = cells.some(c => {
    const lower = c.toLowerCase().trim();
    return ALL_PATTERNS.some(p => lower === p || lower.includes(p));
  });
  if (hasKnownLabel) return true;

  // If the first cell is a long string (>40 chars), probably data
  if (cells[0].trim().length > 40) return false;

  // Conservative fallback: an unknown all-text first row is data. A false
  // negative leaves synthetic column names that the user can correct; a false
  // positive silently deletes a participant response.
  return false;
};

/**
 * Quickly scan CSV headers and count non-empty, meaningful responses per column.
 * Used to drive the ColumnSelector UI — no quality filtering, just fast stats.
 */
export const scanColumns = (rawText: string): ColumnInfo[] => {
  const text = rawText.startsWith('\uFEFF') ? rawText.slice(1) : rawText;
  const sep = detectDelimiter(text);
  const records = parseDelimitedRecords(text, sep);
  if (records.length === 0) return [];

  const firstRowCells = records[0];
  if (firstRowCells.length === 0) return [];

  // ── Header detection heuristic ─────────────────────────────────────────
  // Check if the first row looks like column headers or like data.
  // Headers are typically short labels; data might be long text or numeric IDs.
  const hasHeaders = looksLikeHeader(firstRowCells);

  const headers = hasHeaders
    ? firstRowCells
    : firstRowCells.map((_, i) => `Column ${i + 1}`);
  const dataRecords = hasHeaders ? records.slice(1) : records;
  const totalCount = dataRecords.length;

  // Values that are junk even if non-empty — single chars, yes/no, etc.
  const JUNK_SINGLE = new Set(['x', 'y', 'n', 'q', 'a', 'v', 'o']);
  const JUNK_WORDS = new Set(['yes', 'no', 'ok', 'na', 'n/a', 'null', 'none', '-', '--', '...', 'tbd', 'true', 'false']);

  const isJunk = (val: string): boolean => {
    const v = val.trim().toLowerCase();
    if (v.length === 0) return true;
    if (NULL_PATTERNS.has(v)) return true;
    if (v.length === 1 && JUNK_SINGLE.has(v)) return true;
    if (JUNK_WORDS.has(v)) return true;
    return false;
  };

  const AUTO_ID_TERMS = [...ID_PATTERNS, 'internal', 'ref', 'number', 'num', 'serial', 'respondent'];

  return headers.map((header, colIdx) => {
    const headerLower = header.toLowerCase().trim();
    const sampleValues: string[] = [];
    let nonEmptyCount = 0;

    for (const parts of dataRecords) {
      const cell = parts[colIdx]?.trim() ?? '';
      if (!isJunk(cell)) {
        nonEmptyCount++;
        if (sampleValues.length < 3) {
          sampleValues.push(cell.length > 120 ? cell.slice(0, 120) + '…' : cell);
        }
      }
    }

    let suggestedType: ColumnInfo['suggestedType'];
    if (AUTO_ID_TERMS.some(p => headerLower === p || headerLower.startsWith(p + ' ') || headerLower.endsWith(' ' + p))) {
      suggestedType = 'id';
    } else if (GROUP_PATTERNS.some(p => headerLower.includes(p))) {
      suggestedType = 'group';
    } else if (totalCount > 0 && nonEmptyCount / totalCount < 0.03) {
      suggestedType = 'empty';
    } else {
      suggestedType = 'text';
    }

    const headerShort = header.length > 60 ? header.slice(0, 60) + '…' : header;
    return { index: colIdx, header, headerShort, nonEmptyCount, totalCount, sampleValues, suggestedType };
  });
};

// ─── Preprocessing with User Selections ──────────────────────────────────────

/**
 * Full preprocessing pipeline driven by explicit user column selections.
 *
 * 'combined'     — Concatenates all selected text columns per participant.
 *                  Uses "Q: {header}\nA: {answer}" format ONLY when there are
 *                  multiple columns with real headers. Headerless CSVs or single
 *                  columns produce raw text without Q/A wrapping. One result returned.
 * 'per_question' — Returns one PreprocessResult per selected text column.
 *                  Each only includes participants who answered that column.
 */
export const preprocessWithSelections = (
  rawText: string,
  selection: ColumnSelection,
  mode: MultiColumnMode,
  allColumns: ColumnInfo[],
): PreprocessResult | PreprocessResult[] => {
  const bomStripped = rawText.startsWith('\uFEFF');
  const text = bomStripped ? rawText.slice(1) : rawText;
  const separator = detectDelimiter(text);
  const records = parseDelimitedRecords(text, separator);

  const emptyReport = (): PreprocessReport => ({
    totalRows: 0, keptRows: 0, droppedRows: [],
    duplicateIdsMerged: [], multiColumnsMerged: false,
    separatorDetected: ',', bomStripped,
  });

  if (records.length === 0) {
    return mode === 'per_question'
      ? selection.textColumnIndices.map(() => ({ inputs: [], report: emptyReport() }))
      : { inputs: [], report: emptyReport() };
  }

  // Detect headerless files — same heuristic as scanColumns
  const firstRowCells = records[0];
  const hasHeaders = looksLikeHeader(firstRowCells);
  const dataRecords = hasHeaders ? records.slice(1) : records;

  // Parse all rows once
  const parsedRows = dataRecords.map((cells, i) => {
    const rawId = cells[selection.idColumnIndex]?.trim() ?? '';
    return { rawId: rawId.length > 0 ? rawId : `Row_${i + 1}`, cells };
  });

  // Extract group value for a row
  const extractGroup = (cells: string[]): StakeholderGroup | undefined => {
    if (selection.groupColumnIndex < 0) return undefined;
    const raw = cells[selection.groupColumnIndex]?.trim() ?? '';
    return parseGroup(raw);
  };

  // Quality filter + dedup — mirrors preprocessCSV steps 6-7
  const applyFilter = (
    candidates: Array<{ id: string; text: string; group?: StakeholderGroup; sourceSegments?: ParticipantInput['sourceSegments'] }>,
    multiMerged: boolean,
  ): PreprocessResult => {
    const dropped: DroppedRow[] = [];
    const seenIds = new Map<string, number>();
    const duplicateIdsMerged: string[] = [];

    const filtered = candidates.filter(row => {
      if (isMissingValue(row.text)) {
        dropped.push({ originalId: row.id, originalText: row.text, reason: 'missing_value' }); return false;
      }
      if (hasNoContent(row.text)) {
        dropped.push({ originalId: row.id, originalText: row.text, reason: 'no_content' }); return false;
      }
      if (isTooShort(row.text)) {
        dropped.push({ originalId: row.id, originalText: row.text, reason: 'too_short' }); return false;
      }
      return true;
    });

    const inputs: ParticipantInput[] = filtered.map(row => {
      const count = (seenIds.get(row.id) ?? 0) + 1;
      seenIds.set(row.id, count);
      const finalId = count > 1 ? `${row.id}_${count}` : row.id;
      if (count > 1 && !duplicateIdsMerged.includes(row.id)) duplicateIdsMerged.push(row.id);
      const input: ParticipantInput = { id: finalId, text: row.text };
      if (row.group) input.group = row.group;
      if (row.sourceSegments?.length) input.sourceSegments = row.sourceSegments;
      return input;
    });

    return {
      inputs,
      report: {
        totalRows: candidates.length, keptRows: inputs.length,
        droppedRows: dropped, duplicateIdsMerged,
        multiColumnsMerged: multiMerged, separatorDetected: separator, bomStripped,
      },
    };
  };

  if (mode === 'combined') {
    // Determine whether to use Q/A formatting:
    // - Single column → just use the text directly
    // - Multiple columns with real headers → Q: {header}\nA: {text}
    // - Multiple columns with synthetic headers (headerless CSV) → just concatenate
    const isMultiColumn = selection.textColumnIndices.length > 1;
    const hasSyntheticHeaders = !hasHeaders; // headerless CSV → all headers are "Column N"

    const candidates = parsedRows.map(row => {
      const sourceSegments = selection.textColumnIndices
        .map(colIdx => {
          const cell = row.cells[colIdx]?.trim() ?? '';
          if (isMissingValue(cell)) return null;
          const qHeader = allColumns.find(h => h.index === colIdx)?.header ?? `Column ${colIdx + 1}`;
          return { text: cell, context: isMultiColumn && !hasSyntheticHeaders ? qHeader : undefined };
        })
        .filter((segment): segment is { text: string; context: string | undefined } => segment !== null);
      const promptText = sourceSegments.map(segment => segment.context
        ? `Q: ${segment.context}\nA: ${segment.text}`
        : segment.text).join('\n\n');
      return { id: row.rawId, text: promptText, sourceSegments, group: extractGroup(row.cells) };
    });
    return applyFilter(candidates, selection.textColumnIndices.length > 1);
  } else {
    // per_question
    return selection.textColumnIndices.map(colIdx => {
      const qHeader = allColumns.find(h => h.index === colIdx)?.header ?? `Column ${colIdx + 1}`;
      const candidates = parsedRows
        .filter(row => {
          const cell = row.cells[colIdx]?.trim() ?? '';
          return !isMissingValue(cell) && cell.length > 0;
        })
        .map(row => ({
          id: row.rawId,
          text: row.cells[colIdx]?.trim() ?? '',
          sourceSegments: [{
            text: row.cells[colIdx]?.trim() ?? '',
            context: hasHeaders ? qHeader : undefined,
          }],
          group: extractGroup(row.cells),
        }));
      return applyFilter(candidates, false);
    });
  }
};

// ─── Multi-Document Input ─────────────────────────────────────────────────────

/**
 * Converts an array of distinct text blocks into ParticipantInput[].
 * Each block is treated as one "source" (e.g., a witness statement,
 * an earnings transcript, a policy memo). Empty/junk blocks are filtered out.
 * Labels default to "Source 1", "Source 2", etc. unless explicit labels are given.
 */
export const parseMultiDocumentText = (
  texts: string[],
  labels?: string[],
): ParticipantInput[] => {
  return texts
    .map((text, i) => ({
      id: labels?.[i]?.trim() || `Source_${i + 1}`,
      text: text.trim(),
    }))
    .filter(t => t.text.length >= MIN_CONTENT_CHARS && !isMissingValue(t.text));
};


// ─── Single Document Chunking ─────────────────────────────────────────────────

/**
 * Regex patterns that identify section headings in legal, financial,
 * regulatory, and academic documents. Order matters — more specific patterns first.
 */
const SECTION_HEADING_PATTERNS = [
  // Legal: § 3, §3.1, Section 3.1, Article IV, Clause 5
  /^(§+\s*[\d.]+[a-z]?|(?:section|article|clause|subsection|chapter)\s+[\dIVXLCivxlc]+(?:\.\d+)*)/i,
  // Financial: ITEM 1, ITEM 1A, Item 7A, Part II
  /^(item\s+\d+[a-z]?|part\s+[IVXLCivxlc]+)/i,
  // Numbered headings: 1. Introduction, 2.1 Methods, A. Background
  /^(\d+(?:\.\d+)*\.?\s+[A-Z][a-zA-Z\s]{3,}|[A-Z]\.\s+[A-Z][a-zA-Z\s]{3,})$/,
  // ALL CAPS headings (common in legal briefs and 10-K filings)
  /^[A-Z][A-Z\s\-–:]{6,}$/,
  // Markdown headings (for structured text exports)
  /^#{1,3}\s+.+/,
];

const looksLikeSectionHeading = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return false;
  return SECTION_HEADING_PATTERNS.some(p => p.test(trimmed));
};

/**
 * Convert a section heading to a clean, provenance-friendly ID.
 * e.g. "ITEM 1A. Risk Factors" → "ITEM_1A_Risk_Factors"
 */
const headingToId = (heading: string, index: number): string => {
  const cleaned = heading
    .trim()
    .replace(/^#+\s*/, '')         // strip markdown #
    .replace(/[^\w\s-]/g, '')      // strip non-word chars
    .replace(/\s+/g, '_')          // spaces → underscores
    .replace(/_+/g, '_')           // collapse double underscores
    .slice(0, 50);                  // max 50 chars
  return cleaned.length >= 3 ? cleaned : `Section_${index + 1}`;
};

/**
 * Segments a single long document into chunks for provenance analysis.
 * Each chunk becomes one ParticipantInput (like a "source segment").
 *
 * Strategies:
 * - 'paragraph': Split on double newlines (best for generic documents).
 * - 'sentence':  Split on sentence boundaries (for dense prose).
 * - 'section':   Split on detected section headings — yields semantically
 *                meaningful IDs like "ITEM_1A_Risk_Factors" instead of
 *                "Segment_7". Best for legal briefs, 10-K filings,
 *                clinical reports, policy papers.
 *
 * Very short chunks (< MIN_CONTENT_CHARS) are merged into the previous chunk
 * to avoid noise from headers, page numbers, or short transition phrases.
 */
export const chunkSingleDocument = (
  text: string,
  strategy: 'paragraph' | 'sentence' | 'section' = 'paragraph',
): ParticipantInput[] => {
  if (strategy === 'section') {
    // Split into lines, detect heading boundaries
    const lines = text.split(/\r?\n/);
    const sections: Array<{ heading: string; body: string[] }> = [];
    let currentHeading = 'Introduction';
    let currentBody: string[] = [];
    let headingCount = 0;

    for (const line of lines) {
      if (looksLikeSectionHeading(line)) {
        // Save previous section if it has content
        if (currentBody.some(l => l.trim().length > 0)) {
          sections.push({ heading: currentHeading, body: currentBody });
        }
        currentHeading = line.trim();
        currentBody = [];
        headingCount++;
      } else {
        currentBody.push(line);
      }
    }
    // Push last section
    if (currentBody.some(l => l.trim().length > 0)) {
      sections.push({ heading: currentHeading, body: currentBody });
    }

    // If no headings were detected, fall back to paragraph chunking
    if (headingCount === 0) {
      return chunkSingleDocument(text, 'paragraph');
    }

    return sections
      .map((sec, i) => ({
        id: headingToId(sec.heading, i),
        text: sec.body.join('\n').trim(),
      }))
      .filter(s => {
        const meaningful = s.text.replace(/[\s\p{P}\p{N}]/gu, '');
        return meaningful.length >= MIN_CONTENT_CHARS && !isMissingValue(s.text);
      });
  }

  let rawChunks: string[];

  if (strategy === 'paragraph') {
    // Split on blank lines (double newlines), handling mixed line endings
    rawChunks = text
      .split(/\n\s*\n/)
      .map(c => c.trim())
      .filter(c => c.length > 0);
  } else {
    // Sentence splitting — handle abbreviations, decimal numbers, ellipsis
    rawChunks = text
      .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n')
      .split('\n')
      .map(c => c.trim())
      .filter(c => c.length > 0);
  }

  // Merge very short chunks into previous
  const merged: string[] = [];
  for (const chunk of rawChunks) {
    const meaningful = chunk.replace(/[\s\p{P}\p{N}]/gu, '');
    if (meaningful.length < MIN_CONTENT_CHARS && merged.length > 0) {
      merged[merged.length - 1] += ' ' + chunk;
    } else if (meaningful.length >= MIN_CONTENT_CHARS) {
      merged.push(chunk);
    }
  }

  return merged
    .filter(c => !isMissingValue(c))
    .map((chunk, i) => ({
      id: `Segment_${i + 1}`,
      text: chunk,
    }));
};
