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
  'na', 'n/a', 'n.a', 'n.a.', 'null', 'none', 'nil', '-', '--', '---',
  '.', '..', '...', '….', 'no response', 'no comment', 'no answer',
  'not applicable', 'skip', 'skipped', 'blank', 'empty', 'nothing',
  'prefer not to say', 'prefer not to answer', 'declined', 'unknown',
]);

const MIN_CONTENT_CHARS = 10; // Minimum non-whitespace characters after cleaning

// ─── Delimiter detection ──────────────────────────────────────────────────────

export const detectDelimiter = (firstLine: string): ',' | ';' | '\t' => {
  const counts = {
    ',': (firstLine.match(/,/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  };
  if (counts[';'] > counts[','] && counts[';'] > counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t';
  return ',';
};

// ─── CSV row parser (handles quoted fields for any delimiter) ─────────────────

export const parseRow = (row: string, delimiter: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const next = row[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (next === '"') { current += '"'; i++; }
      else { inQuotes = false; }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

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
  // Count only alphabetic and CJK/Arabic/Devanagari characters — not spaces or punctuation
  const meaningful = text.replace(/[\s\p{P}\p{N}]/gu, '');
  return meaningful.length < MIN_CONTENT_CHARS;
};

const hasNoContent = (text: string): boolean => {
  // All same character repeated (e.g., "aaaaaaa", "........")
  const stripped = text.trim();
  if (stripped.length > 3 && new Set(stripped.toLowerCase()).size <= 2) return true;
  // All digits
  if (/^\d+$/.test(stripped)) return true;
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
  business: 'business', company: 'business', corporate: 'business', ngo: 'business',
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

  // 2. Split into lines
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      inputs: [],
      report: {
        totalRows: 0, keptRows: 0, droppedRows: [],
        duplicateIdsMerged: [], multiColumnsMerged: false,
        separatorDetected: ',', bomStripped,
      },
    };
  }

  // 3. Detect delimiter
  const separator = detectDelimiter(lines[0]);

  // 4. Detect columns
  const mapping = detectColumns(lines[0], separator);
  const dataLines = mapping.hasHeaders ? lines.slice(1) : lines;
  const totalRows = dataLines.length;
  const multiColumnsMerged = mapping.textColumns.length > 1;

  // 5. Parse rows
  const seenIds = new Map<string, number>(); // id → count
  const rawParsed: Array<{ id: string; text: string; group?: StakeholderGroup } | null> = dataLines.map((line, i) => {
    if (!line.trim()) return null;

    const parts = parseRow(line, separator);
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
 * Quickly scan CSV headers and count non-empty, meaningful responses per column.
 * Used to drive the ColumnSelector UI — no quality filtering, just fast stats.
 */
export const scanColumns = (rawText: string): ColumnInfo[] => {
  const text = rawText.startsWith('\uFEFF') ? rawText.slice(1) : rawText;
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const sep = detectDelimiter(lines[0]);
  const headers = parseRow(lines[0], sep);
  if (headers.length === 0) return [];

  const dataLines = lines.slice(1);
  const totalCount = dataLines.length;

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

    for (const line of dataLines) {
      if (!line.trim()) continue;
      const parts = parseRow(line, sep);
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
 * 'combined'     — Concatenates all selected text columns per participant
 *                  as "Q: {header}\nA: {answer}" blocks. One result returned.
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
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);

  const emptyReport = (): PreprocessReport => ({
    totalRows: 0, keptRows: 0, droppedRows: [],
    duplicateIdsMerged: [], multiColumnsMerged: false,
    separatorDetected: ',', bomStripped,
  });

  if (lines.length < 2) {
    return mode === 'per_question'
      ? selection.textColumnIndices.map(() => ({ inputs: [], report: emptyReport() }))
      : { inputs: [], report: emptyReport() };
  }

  const separator = detectDelimiter(lines[0]);
  const dataLines = lines.slice(1);

  // Parse all rows once
  const parsedRows = dataLines.map((line, i) => {
    if (!line.trim()) return { rawId: `Row_${i + 1}`, cells: [] as string[] };
    const cells = parseRow(line, separator);
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
    candidates: Array<{ id: string; text: string; group?: StakeholderGroup }>,
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
    const candidates = parsedRows.map(row => {
      const parts = selection.textColumnIndices
        .map(colIdx => {
          const cell = row.cells[colIdx]?.trim() ?? '';
          if (isMissingValue(cell)) return null;
          const qHeader = allColumns.find(h => h.index === colIdx)?.header ?? `Column ${colIdx + 1}`;
          return `Q: ${qHeader}\nA: ${cell}`;
        })
        .filter((p): p is string => p !== null);
      return { id: row.rawId, text: parts.join('\n\n'), group: extractGroup(row.cells) };
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
          group: extractGroup(row.cells),
        }));
      return applyFilter(candidates, false);
    });
  }
};
