import React, { useState, useEffect } from 'react';

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
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);

const CollapseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
    <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
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

  const header = (expanded: boolean) => (title || subtitle) && (
    <div className={`px-6 py-4 border-b flex-shrink-0 flex items-start justify-between gap-4 ${expanded ? 'border-slate-200' : 'border-slate-100'}`}>
      <div className="min-w-0">
        {title && <h3 className={`font-semibold text-slate-800 ${expanded ? 'text-xl' : 'text-lg'}`}>{title}</h3>}
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {expandable && (
        <button
          onClick={() => setIsExpanded(e => !e)}
          title={expanded ? 'Collapse (Esc)' : 'Expand to fullscreen'}
          className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      )}
    </div>
  );

  // Fullscreen overlay
  if (isExpanded) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          onClick={() => setIsExpanded(false)}
        />
        {/* Panel */}
        <div className="fixed inset-4 md:inset-8 z-50 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {header(true)}
          <div className="flex-1 overflow-auto p-6 min-h-0">
            {children}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'} ${className}`}>
      {header(false)}
      <div className={`p-6 ${flexContent ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : ''}`}>
        {children}
      </div>
    </div>
  );
};
