import React, { useState } from 'react';
import { ColumnInfo, ColumnSelection, MultiColumnMode } from '../../types';

interface ColumnSelectorProps {
  columns: ColumnInfo[];
  selection: ColumnSelection;
  onChange: (updated: ColumnSelection) => void;
  mode: MultiColumnMode;
  onModeChange: (mode: MultiColumnMode) => void;
}

type ColumnRole = 'id' | 'text' | 'group' | 'skip';

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  columns, selection, onChange, mode, onModeChange,
}) => {

  const [expandedSamples, setExpandedSamples] = useState<Set<number>>(new Set());

  const getRole = (colIdx: number): ColumnRole => {
    if (selection.idColumnIndex === colIdx) return 'id';
    if (selection.textColumnIndices.includes(colIdx)) return 'text';
    if (selection.groupColumnIndex === colIdx) return 'group';
    return 'skip';
  };

  const setRole = (colIdx: number, role: ColumnRole) => {
    let { idColumnIndex, textColumnIndices, groupColumnIndex } = selection;

    // Remove from all roles first
    idColumnIndex = idColumnIndex === colIdx ? -1 : idColumnIndex;
    textColumnIndices = textColumnIndices.filter(i => i !== colIdx);
    groupColumnIndex = groupColumnIndex === colIdx ? -1 : groupColumnIndex;

    if (role === 'id') {
      idColumnIndex = colIdx;
    } else if (role === 'text') {
      textColumnIndices = [...textColumnIndices, colIdx].sort((a, b) => a - b);
    } else if (role === 'group') {
      groupColumnIndex = colIdx;
    }
    // 'skip' = leave removed from all

    onChange({ idColumnIndex, textColumnIndices, groupColumnIndex });
  };

  const toggleSampleExpand = (colIdx: number) => {
    setExpandedSamples(prev => {
      const next = new Set(prev);
      next.has(colIdx) ? next.delete(colIdx) : next.add(colIdx);
      return next;
    });
  };

  const ROLE_STYLES: Record<ColumnRole, string> = {
    id:   'border-blue-400 bg-blue-50',
    text: 'border-green-400 bg-green-50',
    group:'border-purple-400 bg-purple-50',
    skip: 'border-slate-200 bg-slate-50 opacity-60',
  };

  const ROLE_BADGE: Record<ColumnRole, string> = {
    id:    'bg-blue-100 text-blue-700',
    text:  'bg-green-100 text-green-700',
    group: 'bg-purple-100 text-purple-700',
    skip:  'bg-slate-100 text-slate-500',
  };

  const ROLE_LABELS: Record<ColumnRole, string> = {
    id: 'ID', text: 'Text', group: 'Group', skip: 'Skip',
  };

  const ROLES: ColumnRole[] = ['id', 'text', 'group', 'skip'];

  return (
    <div className="space-y-5">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {(['id', 'text', 'group', 'skip'] as ColumnRole[]).map(r => (
          <span key={r} className={`px-2 py-1 rounded-full font-medium ${ROLE_BADGE[r]}`}>
            {r === 'id' ? '🔑 ID column' : r === 'text' ? '💬 Text (include)' : r === 'group' ? '🏷 Group' : '⊘ Skip'}
          </span>
        ))}
      </div>

      {/* Column cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {columns.map(col => {
          const role = getRole(col.index);
          const pct = col.totalCount > 0 ? Math.round((col.nonEmptyCount / col.totalCount) * 100) : 0;
          const hasSamples = col.sampleValues.length > 0;
          const isExpanded = expandedSamples.has(col.index);

          return (
            <div
              key={col.index}
              className={`border-2 rounded-xl p-4 transition-all ${ROLE_STYLES[role]}`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${
                    role === 'id' ? 'text-blue-500' : role === 'text' ? 'text-green-600' :
                    role === 'group' ? 'text-purple-500' : 'text-slate-400'
                  }`}>
                    Column {col.index + 1}
                    {col.suggestedType !== 'empty' && col.suggestedType !== role &&
                      <span className="ml-1 opacity-60">(suggested: {col.suggestedType})</span>}
                  </div>
                  <p className="text-sm font-medium text-slate-700 leading-snug" title={col.header}>
                    {col.header.length > 80 ? col.header.slice(0, 80) + '…' : col.header}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[role]}`}>
                  {ROLE_LABELS[role]}
                </span>
              </div>

              {/* Response rate bar */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>{col.nonEmptyCount} of {col.totalCount} responses</span>
                  <span className={pct >= 20 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                    {pct}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${pct >= 20 ? 'bg-green-500' : 'bg-amber-400'}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
              </div>

              {/* Sample values */}
              {hasSamples && (
                <div className="mb-3">
                  <button
                    onClick={() => toggleSampleExpand(col.index)}
                    className="text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600 flex items-center gap-1"
                  >
                    Sample answers {isExpanded ? '▲' : '▼'}
                  </button>
                  {isExpanded && (
                    <div className="mt-1.5 space-y-1">
                      {col.sampleValues.map((v, i) => (
                        <div key={i} className="text-xs text-slate-600 bg-white rounded px-2 py-1.5 border border-slate-100 line-clamp-2">
                          "{v}"
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Role selector */}
              <div className="flex gap-1 flex-wrap">
                {ROLES.map(r => (
                  <button
                    key={r}
                    onClick={() => setRole(col.index, r)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-all font-medium ${
                      role === r
                        ? r === 'id' ? 'bg-blue-600 text-white border-blue-600'
                        : r === 'text' ? 'bg-green-600 text-white border-green-600'
                        : r === 'group' ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-slate-400 text-white border-slate-400'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {r === 'id' ? '🔑 ID' : r === 'text' ? '💬 Include' : r === 'group' ? '🏷 Group' : '⊘ Skip'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summarization mode — only shown when 2+ text columns selected */}
      {selection.textColumnIndices.length >= 2 && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
          <div className="text-sm font-semibold text-indigo-800 mb-3">
            How should multiple questions be analyzed?
          </div>
          <div className="space-y-3">
            {[
              {
                value: 'combined' as MultiColumnMode,
                label: 'Combined analysis',
                desc: 'Merge all selected responses per participant into one input. One unified representation audit across all questions.',
              },
              {
                value: 'per_question' as MultiColumnMode,
                label: 'Per-question analysis',
                desc: 'Run a separate, independent analysis for each question. Only participants who answered that question are included. Results shown in tabs.',
              },
            ].map(opt => (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  value={opt.value}
                  checked={mode === opt.value}
                  onChange={() => onModeChange(opt.value)}
                  className="mt-0.5 accent-indigo-600"
                />
                <div>
                  <div className="text-sm font-semibold text-indigo-900">{opt.label}</div>
                  <div className="text-xs text-indigo-600 mt-0.5">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Validation hint */}
      {selection.textColumnIndices.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Mark at least one column as <strong>Text</strong> to continue.
        </div>
      )}
      {selection.idColumnIndex === -1 && selection.textColumnIndices.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
          No ID column selected — participant IDs will be auto-generated (Row_1, Row_2…).
        </div>
      )}
    </div>
  );
};
