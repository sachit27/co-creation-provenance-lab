import React, { useState, useRef, useEffect } from 'react';
import { BrandLogo } from './BrandLogo';

export interface AppHeaderProps {
  currentView: 'landing' | 'dashboard' | 'setup';
  onNavigate: (view: 'landing' | 'dashboard' | 'setup') => void;
  onOpenMethodology: () => void;
  isDemo?: boolean;
  dataLoaded?: boolean;
  participantCount?: number;
  embeddingTier?: string;
  onExportReport?: () => void;
  onExportProvenance?: () => void;
  onReset?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

/**
 * Top application header featuring responsive navigation, active session status pill,
 * export options dropdown, and view switcher.
 */
export const AppHeader: React.FC<AppHeaderProps> = ({
  currentView,
  onNavigate,
  onOpenMethodology,
  isDemo = false,
  dataLoaded = false,
  participantCount = 0,
  embeddingTier,
  onExportReport,
  onExportProvenance,
  onReset,
  onToggleSidebar,
  isSidebarOpen = false,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close export dropdown on click outside or escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExportOpen(false);
        setMobileMenuOpen(false);
      }
    };

    if (exportOpen || mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportOpen, mobileMenuOpen]);

  const canAccessDashboard = dataLoaded || isDemo;

  // Active Session Pill renderer
  const renderSessionPill = () => {
    if (isDemo) return null;

    if (dataLoaded) {
      return (
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200/80 shadow-xs"
          title="Active custom consultation audit"
        >
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="font-semibold">Active Run:</span>
          <span>{participantCount} records</span>
          {embeddingTier && (
            <span className="text-blue-600/80 font-mono text-[11px]">({embeddingTier})</span>
          )}
        </div>
      );
    }

    return (
      <div
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200"
        title="No active deliberation audit loaded"
      >
        <span className="w-2 h-2 rounded-full bg-slate-300" />
        <span>No Active Run</span>
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">

          {/* Left: Brand Identity */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="sm:hidden"><BrandLogo size="sm" onClick={() => onNavigate('landing')} /></div>
            <div className="hidden sm:block"><BrandLogo
              size="md"
              subtitle="Source-to-Summary Audit Engine"
              onClick={() => onNavigate('landing')}
            /></div>
          </div>

          {/* Center: Navigation Pill Segmented Control (Desktop) */}
          <nav
            aria-label="Application navigation"
            className="hidden xl:flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 shadow-xs"
          >
            {/* Overview */}
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'landing'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Overview</span>
            </button>

            {/* Audit Lab */}
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              title="Open the current audit or explore the saved demo"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'dashboard'
                  ? 'bg-white text-blue-700 shadow-xs font-semibold border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
              <span>Audit Lab</span>
              {canAccessDashboard && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>

            {/* New Audit */}
            <button
              type="button"
              onClick={() => onNavigate('setup')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                currentView === 'setup'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>New Audit</span>
            </button>

            <a
              href={`${import.meta.env.BASE_URL}?live=new`}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50/80 transition-all border border-transparent hover:border-indigo-200/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" />
                <rect x="3" y="6" width="12" height="12" rx="2" />
              </svg>
              <span>Live sessions</span>
            </a>

            {/* Methodology */}
            <button
              type="button"
              onClick={onOpenMethodology}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50/80 transition-all ml-1 border border-transparent hover:border-indigo-200/60"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span>Methodology</span>
            </button>
          </nav>

          {/* Right: Active Session Pill & Action Controls */}
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            {/* Session Pill (Desktop) */}
            <div className="hidden lg:flex items-center">
              {renderSessionPill()}
            </div>

            {/* Export Menu (if data exists) */}
            {(dataLoaded || isDemo) && (onExportReport || onExportProvenance) && (
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setExportOpen(prev => !prev)}
                  aria-expanded={exportOpen}
                  aria-haspopup="true"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform duration-200 ${exportOpen ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {exportOpen && (
                  <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white shadow-xl border border-slate-200 p-1.5 z-50 animate-fadeIn">
                    <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      Audit Artifacts
                    </div>
                    {onExportReport && (
                      <button
                        type="button"
                        onClick={() => {
                          setExportOpen(false);
                          onExportReport();
                        }}
                        className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-700 hover:bg-slate-50 transition-colors group"
                      >
                        <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 group-hover:bg-blue-100 mt-0.5">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">HTML Audit Report</div>
                          <div className="text-[11px] text-slate-500">Interactive stand-alone report with embedded charts</div>
                        </div>
                      </button>
                    )}
                    {onExportProvenance && (
                      <button
                        type="button"
                        onClick={() => {
                          setExportOpen(false);
                          onExportProvenance();
                        }}
                        className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-700 hover:bg-slate-50 transition-colors group"
                      >
                        <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 mt-0.5">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">PROV-O Graph (.jsonld)</div>
                          <div className="text-[11px] text-slate-500">W3C JSON-LD with SHA-256 integrity manifest</div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}


            {/* Reset / New dataset button */}
            {onReset && dataLoaded && (
              <button
                type="button"
                onClick={onReset}
                title="Reset active audit and upload fresh data"
                className="hidden sm:inline-flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                aria-label="Reset Audit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 2v6h6" />
                  <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
                </svg>
              </button>
            )}

            {/* Mobile Actions */}
            <div className="flex items-center gap-1.5 xl:hidden">
              {currentView === 'dashboard' && onToggleSidebar && (
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isSidebarOpen
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-900 text-slate-100 hover:bg-slate-800'
                  }`}
                  aria-label="Toggle workspace navigation drawer"
                  title="Open Workspaces & Views"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                  <span className="hidden sm:inline">Views</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setMobileMenuOpen(prev => !prev)}
                className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Toggle navigation menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {mobileMenuOpen ? (
                    <>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </>
                  ) : (
                    <>
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </>
                  )}
                </svg>
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="xl:hidden py-3 border-t border-slate-200 animate-fadeIn space-y-2">
            <div className="mb-2">
              {renderSessionPill()}
            </div>
            {currentView === 'dashboard' && onToggleSidebar && (
              <button
                type="button"
                onClick={() => {
                  onToggleSidebar();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 mb-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
                <span>Browse Workspaces & Views (16 Tools)</span>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onNavigate('landing');
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium ${
                  currentView === 'landing' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 bg-slate-50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                Overview
              </button>

              <button
                type="button"
                onClick={() => {
                  onNavigate('dashboard');
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium ${
                  currentView === 'dashboard'
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-700 bg-slate-50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9" />
                  <rect x="14" y="3" width="7" height="5" />
                  <rect x="14" y="12" width="7" height="9" />
                  <rect x="3" y="16" width="7" height="5" />
                </svg>
                Audit Lab
              </button>

              <button
                type="button"
                onClick={() => {
                  onNavigate('setup');
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium ${
                  currentView === 'setup' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 bg-slate-50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                New Audit
              </button>

              <a
                href={`${import.meta.env.BASE_URL}?live=new`}
                className="flex items-center gap-2 p-2 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" />
                  <rect x="3" y="6" width="12" height="12" rx="2" />
                </svg>
                Live sessions
              </a>

              <button
                type="button"
                onClick={() => {
                  onOpenMethodology();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 p-2 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                Methodology
              </button>
            </div>

          </div>
        )}
      </div>
    </header>
  );
};

export default AppHeader;
