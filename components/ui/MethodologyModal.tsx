import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BrandLogo } from './BrandLogo';

export interface MethodologyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabKey = 'matching' | 'gini' | 'clustering' | 'tensions';

interface TabItem {
  id: TabKey;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  {
    id: 'matching',
    label: '1. How Voices Are Matched',
    icon: '🎯'
  },
  {
    id: 'gini',
    label: '2. Measuring Fairness (Gini)',
    icon: '⚖️'
  },
  {
    id: 'clustering',
    label: '3. Topic Verification',
    icon: '🛡️'
  },
  {
    id: 'tensions',
    label: '4. Disagreements & Receipts',
    icon: '📜'
  }
];

/**
 * Simplified, accessible Methodology & Math modal designed for clear comprehension.
 */
export const MethodologyModal: React.FC<MethodologyModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('matching');
  const modalRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation, focus trapping & body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    const previousFocusedElement = document.activeElement as HTMLElement | null;

    const initialTimer = setTimeout(() => {
      const activeTabEl = document.getElementById(`tab-${activeTab}`);
      activeTabEl?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(initialTimer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusedElement?.focus();
    };
  }, [isOpen, onClose, activeTab]);

  const handleTabChange = (tabId: TabKey) => {
    setActiveTab(tabId);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  const handleNextTab = () => {
    const currentIndex = TABS.findIndex(t => t.id === activeTab);
    if (currentIndex < TABS.length - 1) {
      handleTabChange(TABS[currentIndex + 1].id);
    }
  };

  const handlePrevTab = () => {
    const currentIndex = TABS.findIndex(t => t.id === activeTab);
    if (currentIndex > 0) {
      handleTabChange(TABS[currentIndex - 1].id);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 bg-slate-950/70 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="methodology-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-4xl h-[88vh] max-h-[800px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-scaleIn text-slate-800"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <BrandLogo variant="mark" size={32} />
            <div>
              <div className="flex items-center gap-2">
                <h2 id="methodology-title" className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Methodology & How It Works
                </h2>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Plain-English explanation of mathematical models, fairness metrics, and validity guardrails
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            aria-label="Close methodology modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div
          role="tablist"
          aria-label="Methodology sections"
          className="px-6 py-2.5 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto sidebar-scroll flex-shrink-0"
        >
          {TABS.map((tab, idx) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = TABS[(idx + 1) % TABS.length].id;
                    handleTabChange(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prev = TABS[(idx - 1 + TABS.length) % TABS.length].id;
                    handleTabChange(prev);
                    document.getElementById(`tab-${prev}`)?.focus();
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Body */}
        <div
          ref={scrollContainerRef}
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          tabIndex={0}
          className="flex-1 overflow-y-auto overscroll-contain p-6 sm:p-8 space-y-6 text-sm leading-relaxed text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* TAB 1: How Voices Are Matched */}
          {activeTab === 'matching' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-gradient-to-r from-indigo-50/70 to-blue-50/70 p-4 rounded-xl border border-indigo-100">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>🎯</span>
                  <span>How Does Voice Matching Work?</span>
                </h3>
                <p className="mt-1 text-slate-600 text-xs sm:text-sm">
                  When an AI summarizes hundreds of citizen inputs, we need a rigorous mathematical way to check if each person's perspective actually made it into the text.
                </p>
              </div>

              {/* 3 Step Visual Pipeline */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mb-2">1</div>
                  <h4 className="font-bold text-slate-900 text-xs">Convert Text to Vectors</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Every participant quote and every sentence in the summary is converted into a high-dimensional mathematical vector (using BGE-M3 or TF-IDF).
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mb-2">2</div>
                  <h4 className="font-bold text-slate-900 text-xs">Cosine Similarity</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    We calculate the directional angle (cosine) between each participant's statement and every single sentence in the summary.
                  </p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center mb-2">3</div>
                  <h4 className="font-bold text-slate-900 text-xs">Strongest Match</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Your representation score is the highest similarity found among all summary sentences. If at least one sentence captured your meaning, you are represented!
                  </p>
                </div>
              </div>

              {/* Math in Plain English Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">The Formula in Plain English</h4>
                <div className="bg-slate-100 p-3 rounded-lg font-mono text-xs text-slate-800 text-center font-bold">
                  Score = Maximum Cosine Similarity(Your Quote, Summary Sentences)
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-lg border border-emerald-200">
                    <strong>Score ≥ 0.70</strong>
                    <p className="text-[11px] mt-0.5">Retained Voice. Strongly captured in the summary text.</p>
                  </div>
                  <div className="bg-amber-50 text-amber-800 p-2.5 rounded-lg border border-amber-200">
                    <strong>0.50 – 0.69</strong>
                    <p className="text-[11px] mt-0.5">Abstracted. Broad concept included, but specifics softened.</p>
                  </div>
                  <div className="bg-rose-50 text-rose-800 p-2.5 rounded-lg border border-rose-200">
                    <strong>Score &lt; 0.50</strong>
                    <p className="text-[11px] mt-0.5">At-Risk / Omitted. Perspective absent from the final summary.</p>
                  </div>
                </div>
              </div>

              {/* Honest Boundary */}
              <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 text-xs text-amber-900">
                <span className="font-bold">⚠️ Honest Epistemic Boundary:</span> Similarity is not endorsement or causation. Just because a summary is semantically close to your statement does not guarantee the AI agreed with you or credited you. It is a mathematical screening tool for human review.
              </div>
            </div>
          )}

          {/* TAB 2: Measuring Fairness (Gini) */}
          {activeTab === 'gini' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-gradient-to-r from-amber-50/70 to-indigo-50/70 p-4 rounded-xl border border-amber-100">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>⚖️</span>
                  <span>How Do We Measure Fairness & Inequality?</span>
                </h3>
                <p className="mt-1 text-slate-600 text-xs sm:text-sm">
                  An AI summary might look great on average, but secretly give 90% of its attention to one vocal group while silencing everyone else. We use the <strong>Gini Coefficient</strong> to detect this.
                </p>
              </div>

              {/* Intuition Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-emerald-600 font-bold text-lg mb-1">G = 0.00 (Perfect Parity)</div>
                  <p className="text-xs text-slate-600">
                    Every single participant's contribution is reflected equally in the final summary. No one is ignored.
                  </p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-rose-600 font-bold text-lg mb-1">G = 1.00 (Maximal Concentration)</div>
                  <p className="text-xs text-slate-600">
                    The AI summary only represents a single person's view, completely erasing all other participants.
                  </p>
                </div>
              </div>

              {/* Why Gini is Threshold-Invariant */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 text-xs mb-1">Why Gini Does Not Change When Moving the Threshold Slider:</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  The slider in the sandbox simply changes the label (&ldquo;Retained&rdquo; vs &ldquo;Omitted&rdquo;). But the <strong>Gini coefficient</strong> evaluates the raw, continuous distribution of all similarity scores across the whole population. Moving a threshold line doesn't change the underlying scores!
                </p>
              </div>

              {/* Bootstrap Stability */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2">1,000 Bootstrap Resamples</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  In small workshops (e.g. 20-50 people), a single outlier could distort the fairness score. Provenance Lab resamples the data 1,000 times to calculate a <strong>95% confidence interval</strong>. If the interval is narrow, you can trust that the measured fairness is statistically stable.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Topic Verification */}
          {activeTab === 'clustering' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-gradient-to-r from-purple-50/70 to-indigo-50/70 p-4 rounded-xl border border-purple-100">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>🛡️</span>
                  <span>Why Provenance Lab Rejects Fake AI Topics</span>
                </h3>
                <p className="mt-1 text-slate-600 text-xs sm:text-sm">
                  Most AI tools force citizen inputs into neat little buckets even when the conversation was completely scattered. Provenance Lab has strict <strong>validity gates</strong>: if data doesn't naturally cluster, it refuses to invent topics.
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-start gap-3">
                  <span className="text-lg">🛑</span>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">Gate 1: Minimum Sample Size (N ≥ 20)</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Clustering on fewer than 20 records is statistically unreliable. The tool automatically disables cluster diagrams when sample size is too low.
                    </p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-start gap-3">
                  <span className="text-lg">📐</span>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">Gate 2: Silhouette Score (Score ≥ 0.25)</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Checks whether comments inside a cluster are actually closer to each other than to neighboring groups. If clusters bleed into each other, topic grouping is blocked.
                    </p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-start gap-3">
                  <span className="text-lg">🔁</span>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">Gate 3: Subsample Stability</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      The algorithm splits the data and checks if the same clusters appear repeatedly. If clusters vanish when a single participant is removed, they are flagged as unstable.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Disagreements & Receipts */}
          {activeTab === 'tensions' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-gradient-to-r from-emerald-50/70 to-teal-50/70 p-4 rounded-xl border border-emerald-100">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>📜</span>
                  <span>Capturing True Disagreements & Citizen Receipts</span>
                </h3>
                <p className="mt-1 text-slate-600 text-xs sm:text-sm">
                  Democratic deliberation is about real trade-offs. Provenance Lab prevents language models from smoothing over conflict and gives participants receipts they can verify.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <h4 className="font-bold text-slate-900 text-xs mb-1.5 flex items-center gap-2">
                    <span>⚔️</span>
                    <span>Exact-Span Tension Extraction</span>
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Instead of paraphrasing, the system isolates <strong>exact verbatim quotes</strong> where participants disagree on funding, locations, or priorities. Facilitators see authentic disputes rather than synthetic compromises.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <h4 className="font-bold text-slate-900 text-xs mb-1.5 flex items-center gap-2">
                    <span>🎫</span>
                    <span>Verifiable Citizen Receipts</span>
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Participants can download a personalized verification page. It proves mathematically which sentences were linked to their contribution, backed by SHA-256 cryptographic digests under W3C PROV-O standards.
                  </p>
                </div>
              </div>

              {/* Attribution & Contact callout */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <div>
                  <span className="font-bold text-slate-800">Provenance Lab Platform</span>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    <a href="mailto:sachitmahajan90@gmail.com" className="text-indigo-600 hover:underline font-medium">
                      Contact: Sachit Mahajan
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={handlePrevTab}
            disabled={activeTab === TABS[0].id}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              activeTab === TABS[0].id
                ? 'border-slate-200 text-slate-400 cursor-not-allowed bg-slate-100'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            ← Previous
          </button>

          <div className="text-xs text-slate-500 font-medium hidden sm:block">
            Section {TABS.findIndex(t => t.id === activeTab) + 1} of {TABS.length}
          </div>

          {activeTab === TABS[TABS.length - 1].id ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-2xs"
            >
              Done Reviewing
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNextTab}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-2xs"
            >
              Next Section →
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MethodologyModal;
