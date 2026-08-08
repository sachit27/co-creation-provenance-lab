import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  allowOverflow?: boolean;
  flexContent?: boolean;
  expandable?: boolean; // Show expand-to-fullscreen button in header
}

const ExpandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const CollapseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
    <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
  </svg>
);

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  allowOverflow = false,
  flexContent = false,
  expandable = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const cardId = useRef(`card-${Math.random().toString(36).slice(2, 8)}`).current;

  // Close on Escape key
  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isExpanded]);

  // Prevent body scroll while expanded
  useEffect(() => {
    document.body.style.overflow = isExpanded ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isExpanded]);

  const HeaderButtons = ({ expanded }: { expanded: boolean }) => (
    <div className="flex items-center gap-1 flex-shrink-0">
      {expandable && (
        <button
          onClick={() => setIsExpanded(e => !e)}
          title={expanded ? 'Collapse (Esc)' : 'Expand to fullscreen'}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      )}
    </div>
  );

  const header = (expanded: boolean) => (title || subtitle) && (
    <div className={`px-6 py-4 border-b flex-shrink-0 flex items-start justify-between gap-4 ${expanded ? 'border-slate-200' : 'border-slate-100'}`}>
      <div className="min-w-0">
        {title && <h3 className={`font-semibold text-slate-800 ${expanded ? 'text-xl' : 'text-lg'}`}>{title}</h3>}
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <HeaderButtons expanded={expanded} />
    </div>
  );

  // Fullscreen modal rendered via Portal directly into document.body.
  // This bypasses ALL parent layout context, giving the modal full viewport dimensions
  // so that Recharts ResponsiveContainer can correctly measure its container.
  const fullscreenModal = isExpanded ? ReactDOM.createPortal(
    <>
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9998]"
        onClick={() => setIsExpanded(false)}
      />
      <div
        className="fixed z-[9999] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ inset: '2rem' }}
      >
        {header(true)}
        <div
          id={`${cardId}-expanded`}
          className="flex-1 overflow-auto p-6"
          style={{ minHeight: 0 }}
        >
          {children}
        </div>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      {/* Portal-based fullscreen modal (separate from document flow) */}
      {fullscreenModal}

      {/* Original card always stays in the DOM, unchanged */}
      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 card-hover ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'} ${className}`}>
        {header(false)}
        <div id={cardId} className={`p-6 ${flexContent ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : ''}`}>
          {children}
        </div>
      </div>
    </>
  );
};
