import React, { useMemo, useState } from 'react';
import { ConceptFidelityResult } from '../../types';
import { useResponsiveChart, truncateText } from '../../hooks/useResponsiveChart';

interface ConceptDistortionProps {
  data: ConceptFidelityResult;
}

export const ConceptDistortion: React.FC<ConceptDistortionProps> = ({ data }) => {
  const { containerRef, isCompact, isMobile, config } = useResponsiveChart({ minHeight: 320 });
  const [showAllPreserved, setShowAllPreserved] = useState(false);
  const [showAllDropped, setShowAllDropped] = useState(false);

  // Calculate additional metrics
  const metrics = useMemo(() => {
    const totalConcepts = data.preservedConcepts.length + data.droppedConcepts.length;
    const addedCount = data.addedConcepts?.length || 0;
    return {
      totalConcepts,
      retentionRate: totalConcepts > 0 ? (data.preservedConcepts.length / totalConcepts * 100) : 0,
      addedCount
    };
  }, [data]);

  // Limit displayed concepts unless "show all" is clicked
  const displayedPreserved = showAllPreserved ? data.preservedConcepts : data.preservedConcepts.slice(0, 12);
  const displayedDropped = showAllDropped ? data.droppedConcepts : data.droppedConcepts.slice(0, 12);



  return (
    <div ref={containerRef} className="flex-1 min-h-[320px] w-full flex flex-col gap-4 p-2">
      {/* Metric Cards - Enhanced */}
      {/* Metric Cards - Enhanced */}
      <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-2'}`}>
        <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
          <div className="text-[10px] text-green-700 font-bold uppercase tracking-wider">Preserved</div>
          <div className={`font-bold text-green-800 mt-1 ${isMobile ? 'text-xl' : 'text-2xl'}`}>
            {data.preservedConcepts.length}
          </div>
          <div className="text-[10px] text-green-600 mt-0.5">concepts kept</div>
        </div>

        {metrics.addedCount > 0 ? (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
            <div className="text-[10px] text-blue-700 font-bold uppercase tracking-wider">Added</div>
            <div className={`font-bold text-blue-800 mt-1 ${isMobile ? 'text-xl' : 'text-2xl'}`}>
              {metrics.addedCount}
            </div>
            <div className="text-[10px] text-blue-600 mt-0.5">new in summary</div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg opacity-50">
            <div className="text-[10px] text-slate-700 font-bold uppercase tracking-wider">Added</div>
            <div className={`font-bold text-slate-800 mt-1 ${isMobile ? 'text-xl' : 'text-2xl'}`}>0</div>
            <div className="text-[10px] text-slate-600 mt-0.5">no hallucinations</div>
          </div>
        )}
      </div>

      {/* Visual fidelity bar REMOVED as requested */}

      {/* Concept Lists - Enhanced */}
      <div className={`grid gap-4 flex-1 min-h-0 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {/* Preserved */}
        <div className="border border-green-200 rounded-lg bg-white shadow-sm flex flex-col min-h-[140px] overflow-hidden">
          <div className="bg-green-50 px-3 py-2 border-b border-green-100 flex items-center justify-between">
            <h4 className="text-sm font-bold text-green-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full"></span>
              Preserved ({data.preservedConcepts.length})
            </h4>
            {data.preservedConcepts.length > 12 && (
              <button
                onClick={() => setShowAllPreserved(!showAllPreserved)}
                className="text-[10px] text-green-600 hover:text-green-800 font-medium"
              >
                {showAllPreserved ? 'Show less' : `+${data.preservedConcepts.length - 12} more`}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
            <div className="flex flex-wrap gap-1.5">
              {displayedPreserved.length > 0 ? (
                displayedPreserved.map(c => (
                  <span
                    key={c}
                    className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium hover:bg-green-200 transition-colors cursor-default"
                    title={c}
                  >
                    {truncateText(c, config.labelTruncateLength)}
                  </span>
                ))
              ) : (
                <span className="text-slate-400 italic text-sm">No concepts mapped</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Note */}
      <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
        <strong>Method:</strong> {isCompact ? (
          'TF-IDF keyword extraction + lexical matching'
        ) : (
          'Lexical keyword extraction (TF-IDF) identifies key nouns/verbs from inputs and checks their presence in the summary. Complements semantic similarity by showing exactly what was lost.'
        )}
      </div>
    </div>
  );
};
