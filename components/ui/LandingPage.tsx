import React, { useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { SynthesisTrace } from '../visualizations/SynthesisTrace';
import { ILLUSTRATIVE_SYNTHESIS_TRACE } from '../../services/synthesisTrace';

export interface LandingPageProps {
  onOpenDemo: () => void;
  onOpenSetup: () => void;
  onOpenMethodology: () => void;
  isDemoAvailable: boolean;
}

// Inline SVGs for crisp, zero-dependency rendering
const Icons = {
  Sparkles: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  ),
  Upload: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  BookOpen: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
  Check: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  XCircle: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  ),
  ShieldCheck: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
    </svg>
  ),
  Sliders: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
    </svg>
  ),
  Info: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  ExternalLink: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
};

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenDemo,
  onOpenSetup,
  onOpenMethodology,
  isDemoAvailable
}) => {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<number>(0);
  const [copiedCitation, setCopiedCitation] = useState<boolean>(false);

  const handleCopyCitation = () => {
    const bibtex = `@software{mahajan2026provenancelab,
  author = {Mahajan, Sachit},
  title = {Provenance Lab: Auditing Representation, Alignment, and Evidence in AI-Assisted Synthesis},
  year = {2026},
}`;
    navigator.clipboard.writeText(bibtex).then(() => {
      setCopiedCitation(true);
      setTimeout(() => setCopiedCitation(false), 2500);
    });
  };

  // 4 Analytical Workspaces concise definitions
  const workspaces = [
    {
      id: 'triage',
      number: '01',
      title: 'Review overview',
      badge: 'Start here',
      headline: 'See the overall pattern',
      question: 'Which comments have strong or weak possible links to the summary, and do patterns differ by group?',
      tools: ['Coverage overview', 'Comments to review', 'Stability checks', 'Group comparison'],
      color: 'blue'
    },
    {
      id: 'spaces',
      number: '02',
      title: 'Explore themes',
      badge: 'Explore ideas',
      headline: 'Explore the discussion',
      question: 'Which comments appear related, and which perspectives sit apart from the main discussion?',
      tools: ['Discussion map', 'Similar comments', 'Named ideas', 'Theme checks'],
      color: 'indigo'
    },
    {
      id: 'trace',
      number: '03',
      title: 'Trace evidence',
      badge: 'Inspect links',
      headline: 'Follow comments into the summary',
      question: 'Which original comments are linked to each summary sentence, and what does the exact wording say?',
      tools: ['Source-to-summary trace', 'Association map', 'Claim evidence review', 'Sentence comparison'],
      color: 'emerald'
    },
    {
      id: 'audit',
      number: '04',
      title: 'Review & revise',
      badge: 'Review and revise',
      headline: 'Keep disagreements visible',
      question: 'Where might disagreement or detail have been softened, and what should a facilitator review or revise?',
      tools: ['Disagreement review', 'Summary revision', 'Wording changes', 'Participant receipts'],
      color: 'amber'
    }
  ];

  return (
    <div className="flex-1 bg-slate-50 text-slate-900 font-sans antialiased [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-indigo-600 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-indigo-600 selection:bg-indigo-500 selection:text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-14 lg:pt-16 lg:pb-20 border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/60 to-slate-100/50">
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Brand Logo Anchor */}
          <div className="flex justify-center mb-5">
            <BrandLogo variant="mark" size={60} withBadge />
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-slate-900 leading-[1.15]">
            Whose views are reflected in the AI summary?
          </h1>

          {/* Subhead - Punchy & Direct */}
          <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Trace summaries back to the contributions behind them. Explore possible omissions, changes in meaning, and differences across groups. Use the Audit Lab to inspect evidence, compare perspectives, and document revisions.
          </p>

          {/* Primary Call-to-Actions */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onOpenDemo}
              disabled={!isDemoAvailable}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all ${
                isDemoAvailable
                  ? 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98]'
                  : 'bg-slate-400 cursor-not-allowed'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Explore the demo</span>
              <Icons.ArrowRight />
            </button>

            <button
              onClick={onOpenSetup}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs active:scale-[0.98]"
            >
              <Icons.Upload />
              <span>Start an audit</span>
            </button>

            <button
              onClick={onOpenMethodology}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-all"
            >
              <Icons.BookOpen />
              <span>Methods & limitations</span>
            </button>
          </div>

          <p className="mt-7 text-xs sm:text-sm text-slate-500 max-w-2xl mx-auto">
            The demo uses sample comments about nature-based solutions, such as parks, trees, and greener streets. It illustrates one possible context for participatory review.
          </p>
        </div>
      </section>

      <section aria-labelledby="workflows-heading" className="py-12 bg-white border-b border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 id="workflows-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center">A clear workflow for the Audit Lab</h2>
          <p className="mt-3 text-center text-sm text-slate-600">For facilitators, researchers, and policy teams reviewing how a synthesis reflects its sources.</p>
          <div className="grid md:grid-cols-3 gap-5 mt-7">
            {[
              { step: '01', title: 'Bring your material', text: 'Upload comments or documents. Paste an existing summary or generate a draft with your chosen provider.' },
              { step: '02', title: 'Inspect the evidence', text: 'Follow source matches, compare groups, and review possible changes in language, claims, and disagreement.' },
              { step: '03', title: 'Revise and keep a record', text: 'Record your decisions, compare a rescored revision, and export the evidence behind your review.' },
            ].map(item => <article key={item.step} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-xs font-semibold text-indigo-700">{item.step}</p>
              <h3 className="mt-2 text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
            </article>)}
          </div>
          <p className="mt-6 text-center text-sm leading-relaxed text-slate-600">Use with public consultations, policy workshops, research synthesis, and organizational feedback.</p>
        </div>
      </section>

      {/* A shared visual story: illustrative here, real audit data in the lab. */}
      <section id="synthesis-story" className="py-14 bg-white border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-3">
              <Icons.Sparkles />
              <span>Explore the journey</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Follow a contribution into a summary
            </h2>
            <p className="mt-3 text-slate-600 text-sm sm:text-base">
              Contributors can discuss the same topic and still mean different things. Select a comment to follow its wording into a short synthesis and inspect what deserves another look.
            </p>
          </div>
          <SynthesisTrace {...ILLUSTRATIVE_SYNTHESIS_TRACE} illustrative title="From original comments to the synthesis" />
          <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <p>This example is hand-authored to explain the review process. Links and review labels in a real audit come from the selected analysis and should be checked against the source text.</p>
            <button
              onClick={onOpenDemo}
              disabled={!isDemoAvailable}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Explore the demo <Icons.ArrowRight />
            </button>
          </div>
        </div>
      </section>

      {/* Feature 2: Bento Grid - The AI Synthesis Problem */}
      <section id="problem-comparison" className="py-14 bg-slate-50 border-b border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">Why review matters</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mt-1">
              What Can Get Lost in a Smooth Summary?
            </h2>
            <p className="mt-2 text-slate-600 text-xs sm:text-sm">
              A smooth, confident summary can still leave out specific ideas, blur disagreement, or make one group’s concerns harder to see.
            </p>
          </div>

          {/* 4-Item Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bento 1: Sentence Alignment */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                  Find possible links
                </span>
                <span className="text-[11px] font-semibold text-slate-400">Source evidence</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">Trace summary claims to comments</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Compare each summary sentence with the original comments to find possible supporting evidence. A match estimate can guide review, but does not establish that a claim is supported or that a view was fairly represented.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>Open the exact source and summary wording for review</span>
              </div>
            </div>

            {/* Bento 2: Gini Inequality */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                  Compare patterns
                </span>
                <span className="text-[11px] font-semibold text-slate-400">Group comparisons</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">Check whose comments are reflected</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Compare patterns across groups to spot possible imbalances. These descriptive comparisons do not prove that a group was excluded or that the sample represents the wider community.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>See group patterns with their sample sizes</span>
              </div>
            </div>

            {/* Bento 3: Gate-Checked Validity */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                  Check theme reliability
                </span>
                <span className="text-[11px] font-semibold text-slate-400">Discussion themes</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">Explore recurring themes carefully</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                The tool checks whether there is enough clear structure before showing topic groups. Small or ambiguous collections may not support reliable themes.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>Checks whether proposed topic groups have enough supporting structure</span>
              </div>
            </div>

            {/* Bento 4: Verbatim Tension Spans */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono font-bold bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded border border-cyan-200">
                  Keep a review trail
                </span>
                <span className="text-[11px] font-semibold text-slate-400">Review and revision</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1.5">Keep disagreements and evidence visible</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Find comments that appear to disagree and keep source references alongside the summary. These are prompts for facilitator review, not an automatic judgment about what participants meant.
              </p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>Inspect source references and export a record of the audit</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature 3: The 4 Decision Workspaces Interactive Explorer */}
      <section id="analytical-workspaces" className="py-14 bg-white border-b border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">Explore the workspace</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mt-1">
              Find a starting point for your review
            </h2>
            <p className="mt-2 text-slate-600 text-xs sm:text-sm">
              Move from an overview to original contributions, then review disagreements and possible revisions.
            </p>
          </div>

          {/* Interactive Workspace Navigation Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 p-1 bg-slate-100 rounded-xl max-w-2xl mx-auto mb-6">
            {workspaces.map((ws, idx) => (
              <button
                key={ws.id}
                onClick={() => setActiveWorkspaceTab(idx)}
                aria-pressed={activeWorkspaceTab === idx}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeWorkspaceTab === idx
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span className="font-mono text-slate-400">{ws.number}</span>
                <span>{ws.title}</span>
              </button>
            ))}
          </div>

          {/* Active Workspace Showcase Card */}
          {(() => {
            const currentWs = workspaces[activeWorkspaceTab];
            return (
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200/90 p-6 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        Workspace {currentWs.number}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">{currentWs.badge}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mt-1">{currentWs.headline}</h3>
                  </div>

                  <button
                    onClick={onOpenDemo}
                    disabled={!isDemoAvailable}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xs transition-all w-fit disabled:bg-slate-400 disabled:cursor-not-allowed"
                  >
                    <span>Open the demo</span>
                    <Icons.ArrowRight />
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-600 font-medium mb-3">
                    <strong className="text-slate-800">Review question:</strong> &ldquo;{currentWs.question}&rdquo;
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {currentWs.tools.map(tool => (
                      <div key={tool} className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                        <div className="text-[11px] font-bold text-slate-800">{tool}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Review tool</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* Feature 4: Data handling choices */}
      <section id="privacy-architecture" className="py-14 bg-slate-50 border-b border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">Data processing</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 mt-1">
              Choose How Your Data Is Processed
            </h2>
            <p className="mt-2 text-slate-600 text-xs sm:text-sm">
              Review the data path before starting: local models can keep analysis on your machine, while cloud providers receive the content needed for the selected analysis.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mb-3">
                <Icons.ShieldCheck />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Local Analysis Option</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Run supported models and embeddings locally with Ollama and BGE-M3 when your setup requires local processing.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mb-3">
                <Icons.Sliders />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Cloud analysis option</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                If you choose OpenAI, Claude, Gemini, or Groq, the selected provider receives data for those requests. Live participants also send their input to the facilitator’s session server.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center mb-3">
                <Icons.Sparkles />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Export a review record</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Export source references and analysis records to document your review and support later discussion of revisions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 bg-white text-slate-600 text-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BrandLogo variant="mark" size={24} />
            <span className="font-bold text-slate-800">Provenance Lab</span>
            <span>•</span>
            <a
              href="mailto:sachitmahajan90@gmail.com"
              className="text-slate-600 hover:text-indigo-600 font-medium transition-colors"
            >
              Contact: Sachit Mahajan
            </a>
          </div>

          <div className="flex items-center gap-5">
            <button
              onClick={handleCopyCitation}
              className="hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer font-medium"
            >
              <span>{copiedCitation ? '✓ BibTeX Copied' : 'Copy citation'}</span>
            </button>

            <button
              onClick={onOpenMethodology}
              className="hover:text-slate-900 transition-colors cursor-pointer font-medium"
            >
              Methods & limitations
            </button>

          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
