import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ParticipantAnalysis } from '../../types';
import { getResponsiveColumns, truncateText, formatMetric } from '../../hooks/useResponsiveChart';

interface ContributionLineageProps {
  data: ParticipantAnalysis[];
  sentences: string[];
  /**
   * Brushing: the participant selected elsewhere in the dashboard. When
   * provided, this view becomes a controlled component so a participant picked
   * on the Discussion Map stays highlighted here (and vice versa) instead of
   * each chart keeping its own private selection.
   */
  selectedId?: string | null;
  onSelectParticipant?: (id: string | null) => void;
}

export const ContributionLineage: React.FC<ContributionLineageProps> = ({
  data, sentences, selectedId, onSelectParticipant,
}) => {
  const [hoveredInput, setHoveredInput] = useState<string | null>(null);
  const [hoveredSentence, setHoveredSentence] = useState<number | null>(null);
  const [localSelected, setLocalSelected] = useState<string | null>(null);

  // Controlled when the parent supplies a selection, uncontrolled otherwise —
  // so the component still works standalone.
  const isControlled = onSelectParticipant !== undefined;
  const selectedInput = isControlled ? (selectedId ?? null) : localSelected;
  const setSelectedInput = (id: string | null) => {
    if (isControlled) onSelectParticipant!(id);
    else setLocalSelected(id);
  };
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Pagination: show 50 participants per page to prevent SVG explosion
  const PAGE_SIZE = 50;
  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const needsPagination = data.length > PAGE_SIZE;

  // ResizeObserver for responsive width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      setContainerWidth(rect.width || 800);
    };

    requestAnimationFrame(updateWidth);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width || 800);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // PRE-PROCESSING: Sort Data for cleaner flow lines
  const sortedInputs = useMemo(() => {
    return [...data].sort((a, b) => {
      const primaryA = a.sentenceMatches[0]?.sentenceIndex ?? 999;
      const primaryB = b.sentenceMatches[0]?.sentenceIndex ?? 999;
      return primaryA - primaryB;
    });
  }, [data]);

  // Paginated view: only render the current page of participants
  const visibleInputs = useMemo(() => {
    if (!needsPagination) return sortedInputs;
    return sortedInputs.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  }, [sortedInputs, currentPage, needsPagination]);

  // Calculate connection statistics
  const connectionStats = useMemo(() => {
    const totalConnections = data.reduce((sum, p) => sum + p.sentenceMatches.length, 0);
    const strongConnections = data.reduce((sum, p) =>
      sum + p.sentenceMatches.filter(m => m.similarity >= 0.6).length, 0);
    return { total: totalConnections, strong: strongConnections };
  }, [data]);

  // Dynamic layout calculations based on container width
  const { leftColWidth, rightColWidth, rightColX, controlOffset, gapWidth } = useMemo(
    () => getResponsiveColumns(containerWidth),
    [containerWidth]
  );

  // Layout constants with better scaling
  const isMobile = containerWidth < 500;
  const isCompact = containerWidth < 600;
  const inputRowHeight = isMobile ? 26 : 30;
  const sentenceRowHeight = Math.max(55, (visibleInputs.length * inputRowHeight) / Math.max(1, sentences.length));
  const containerHeight = Math.max(
    visibleInputs.length * inputRowHeight,
    sentences.length * sentenceRowHeight,
    400
  ) + 60;

  // Responsive font sizes
  const labelFontSize = isMobile ? '10px' : isCompact ? '11px' : '12px';
  const scoreFontSize = isMobile ? '9px' : '10px';
  const labelTruncateLength = isMobile ? 8 : isCompact ? 12 : 18;

  // Get gradient color based on similarity
  const getConnectionColor = (similarity: number, isActive: boolean) => {
    if (isActive) return '#3b82f6';
    if (similarity >= 0.7) return '#10b981';
    if (similarity >= 0.5) return '#f59e0b';
    return '#94a3b8';
  };

  return (
    <div ref={containerRef} className="w-full overflow-hidden border border-slate-200 rounded-lg bg-white shadow-sm">
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex flex-wrap justify-between items-start gap-2">
          <div>
            <h3 className="font-semibold text-slate-700 text-sm md:text-base">Contribution-to-Sentence Matches</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {isCompact ? 'Hover to inspect similarity links' : 'Semantic similarity candidates between source records and summary sentences'}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="bg-slate-100 rounded px-2 py-1 text-center">
              <div className="text-slate-700 font-bold text-sm">{connectionStats.total}</div>
              <div className="text-slate-500 text-[9px]">Candidates</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded px-2 py-1 text-center">
              <div className="text-green-700 font-bold text-sm">{connectionStats.strong}</div>
              <div className="text-green-600 text-[9px]">Strong</div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-2 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-green-500 rounded"></span>
            <span className="text-slate-500">Strong (≥0.7)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-amber-500 rounded"></span>
            <span className="text-slate-500">Medium (0.5-0.7)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-slate-400 rounded"></span>
            <span className="text-slate-500">Weak (&lt;0.5)</span>
          </span>
        </div>

        {/* Pagination controls */}
        {needsPagination && (
          <div className="flex items-center gap-2 mt-2 bg-slate-100 rounded px-3 py-1.5">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="text-xs font-bold text-slate-600 hover:text-blue-600 disabled:text-slate-300 disabled:cursor-not-allowed px-1.5 py-0.5 rounded hover:bg-white transition-colors"
            >
              ← Prev
            </button>
            <span className="text-[10px] text-slate-500 flex-1 text-center">
              Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, data.length)} of {data.length} participants
              {' '}(Page {currentPage + 1}/{totalPages})
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className="text-xs font-bold text-slate-600 hover:text-blue-600 disabled:text-slate-300 disabled:cursor-not-allowed px-1.5 py-0.5 rounded hover:bg-white transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Flow Diagram */}
      <div className="w-full overflow-y-auto max-h-[550px] overflow-x-auto relative custom-scrollbar bg-slate-50/30">
        <div className="relative" style={{ width: Math.max(containerWidth, 450), minWidth: 450, height: containerHeight }}>

          {/* SVG Layer */}
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            style={{ zIndex: 0 }}
            width={Math.max(containerWidth, 450)}
            height={containerHeight}
          >
            <defs>
              <linearGradient id="gradStrong" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="gradMedium" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6" />
              </linearGradient>
              <linearGradient id="gradWeak" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.3" />
              </linearGradient>
            </defs>

            {visibleInputs.map((p, inputIndex) => {
              const startY = (inputIndex * inputRowHeight) + (inputRowHeight / 2) + 30;
              const startX = leftColWidth;

              const isInputHovered = hoveredInput === p.id || selectedInput === p.id;

              return p.sentenceMatches.map((match, mIdx) => {
                // Only draw weak matches if hovering/selecting specific participant
                if (match.similarity < 0.45 && !isInputHovered && hoveredSentence !== match.sentenceIndex) return null;

                const endY = (match.sentenceIndex * sentenceRowHeight) + (sentenceRowHeight / 2) + 30;
                const endX = rightColX;

                const isSentenceHovered = hoveredSentence === match.sentenceIndex;
                const isActive = isInputHovered || isSentenceHovered;
                const isBackground = (hoveredInput || hoveredSentence !== null || selectedInput) && !isActive;

                // Dynamic bezier control points
                const path = `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`;

                // Visual styling based on strength
                const strokeWidth = isActive ? 3.5 : Math.max(1.5, match.similarity * 3);
                const strokeColor = getConnectionColor(match.similarity, isActive);
                const opacity = isActive ? 0.95 : isBackground ? 0.08 : Math.max(0.2, match.similarity * 0.6);

                return (
                  <path
                    key={`${p.id}-${match.sentenceIndex}-${mIdx}`}
                    d={path}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeOpacity={opacity}
                    strokeLinecap="round"
                  />
                );
              });
            })}
          </svg>

          {/* Left Column: Participants */}
          <div
            className="absolute top-[30px] left-0 flex flex-col gap-0"
            style={{ width: leftColWidth, zIndex: 10 }}
          >
            {visibleInputs.map((p) => {
              const isHovered = hoveredInput === p.id;
              const isSelected = selectedInput === p.id;
              const hasConnection = hoveredSentence !== null && p.sentenceMatches.some(m => m.sentenceIndex === hoveredSentence);

              return (
                <div
                  key={p.id}
                  style={{ height: inputRowHeight, fontSize: labelFontSize }}
                  className={`
                    px-2 md:px-3 flex items-center justify-between border-r-4 cursor-pointer transition-all
                    ${isHovered || isSelected ? 'bg-blue-50 border-blue-500 text-blue-800 shadow-sm' : 'hover:bg-slate-50 border-transparent text-slate-600'}
                    ${(hoveredSentence !== null && !hasConnection) ? 'opacity-25' : 'opacity-100'}
                  `}
                  onMouseEnter={() => setHoveredInput(p.id)}
                  onMouseLeave={() => setHoveredInput(null)}
                  onClick={() => setSelectedInput(selectedInput === p.id ? null : p.id)}
                  title={`${p.id}: ${p.originalText.substring(0, 150)}`}
                >
                  <span className="truncate font-medium" style={{ maxWidth: leftColWidth - 55 }}>
                    {truncateText(p.id, labelTruncateLength)}
                  </span>
                  <span
                    className={`px-1.5 rounded font-mono ${p.representationScore >= 0.6 ? 'bg-green-100 text-green-700' :
                      p.representationScore >= 0.4 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}
                    style={{ fontSize: scoreFontSize }}
                  >
                    {formatMetric(p.representationScore)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Center Label */}
          {gapWidth > 80 && (
            <div
              className="absolute top-2 text-[9px] text-slate-400 font-medium text-center"
              style={{ left: leftColWidth + gapWidth / 2 - 40, width: 80 }}
            >
              Semantic Links
            </div>
          )}

          {/* Right Column: Sentences */}
          <div
            className="absolute top-[30px] flex flex-col gap-0"
            style={{ left: rightColX, width: rightColWidth, zIndex: 10 }}
          >
            {sentences.map((sent, i) => {
              const isHovered = hoveredSentence === i;
              const connectedInput = hoveredInput || selectedInput;
              const hasConnection = connectedInput &&
                visibleInputs.find(p => p.id === connectedInput)?.sentenceMatches.some(m => m.sentenceIndex === i);

              return (
                <div
                  key={i}
                  style={{ height: sentenceRowHeight, fontSize: labelFontSize }}
                  className={`
                    p-2 border-l-4 flex items-center cursor-pointer transition-all
                    ${isHovered ? 'bg-orange-50 border-orange-400 text-slate-900 shadow-sm' : 'hover:bg-white border-slate-200 text-slate-600'}
                    ${(connectedInput && !hasConnection) ? 'opacity-25' : 'opacity-100'}
                  `}
                  onMouseEnter={() => setHoveredSentence(i)}
                  onMouseLeave={() => setHoveredSentence(null)}
                  title={sent}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-slate-400 font-medium mb-0.5">S{i + 1}</div>
                    <span className="line-clamp-2 leading-tight">{sent}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500">
        <strong>Tip:</strong> Click a participant to lock selection. Thicker lines = stronger semantic match.
      </div>
    </div>
  );
};
