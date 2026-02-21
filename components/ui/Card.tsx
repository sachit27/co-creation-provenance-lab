import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  allowOverflow?: boolean;
  flexContent?: boolean; // New prop to enable flex layout for content
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  allowOverflow = false,
  flexContent = false
}) => {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'} ${className}`}>
      {(title || subtitle) && (
        <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0">
          {title && <h3 className="text-lg font-semibold text-slate-800">{title}</h3>}
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
      )}
      <div className={`p-6 ${flexContent ? 'flex-1 flex flex-col min-h-0 overflow-hidden' : ''}`}>
        {children}
      </div>
    </div>
  );
};
