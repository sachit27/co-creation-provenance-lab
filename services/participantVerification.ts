/**
 * Participant Verification Service
 *
 * Generates a standalone HTML "verification hub" that participants can open
 * to confirm whether the AI summary captured their perspective. Since this
 * tool is privacy-first with no backend, responses are stored in the page's
 * own localStorage and can be exported as JSON for the facilitator to import.
 *
 * Workflow:
 *  1. Facilitator runs analysis → clicks "Export Verification Page"
 *  2. A self-contained HTML file is downloaded
 *  3. Facilitator distributes the file (email, shared drive, USB, etc.)
 *  4. Each participant opens it, finds their name, and clicks their verdict
 *  5. Responses are saved in the page's localStorage
 *  6. Facilitator opens the same page and clicks "Export Responses (JSON)"
 *  7. JSON is imported back into the main tool via "Import Verification" button
 */

import { AnalysisResult } from '../types';

// ─── HTML template ────────────────────────────────────────────────────────────

export const generateVerificationHTML = (data: AnalysisResult): string => {
  // Embed all participant data as JSON directly into the HTML
  const participantData = data.participants.map(p => ({
    id: p.id,
    text: p.originalText,
    score: p.representationScore,
    matchedSentence: data.summarySentences[p.topSentenceMatchIndex] ?? '',
    status:
      p.representationScore >= 0.6
        ? 'well-represented'
        : p.representationScore < 0.3
        ? 'at-risk'
        : 'underrepresented',
  }));

  const escapeJson = (obj: unknown) =>
    JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Participant Verification — ${data.config.datasetName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc; color: #1e293b; padding: 24px;
      max-width: 860px; margin: 0 auto; line-height: 1.6;
    }
    header { border-bottom: 3px solid #3b82f6; padding-bottom: 16px; margin-bottom: 24px; }
    header h1 { font-size: 22px; color: #0f172a; }
    header p { color: #64748b; font-size: 14px; margin-top: 4px; }
    .summary-box {
      background: #f0f9ff; border-left: 4px solid #3b82f6;
      padding: 16px; border-radius: 6px; margin-bottom: 28px; font-size: 14px; color: #1e293b;
    }
    .summary-box strong { display: block; margin-bottom: 6px; font-size: 12px; text-transform: uppercase; color: #64748b; letter-spacing: .5px; }
    .participant-card {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 18px; margin-bottom: 16px; transition: box-shadow .15s;
    }
    .participant-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.07); }
    .p-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .p-id { font-weight: 700; font-size: 15px; }
    .score-badge {
      font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
    }
    .score-well  { background: #dcfce7; color: #166534; }
    .score-under { background: #fef9c3; color: #854d0e; }
    .score-risk  { background: #fee2e2; color: #991b1b; }
    .quote { font-style: italic; color: #475569; font-size: 14px; background: #f8fafc; padding: 10px 14px; border-radius: 6px; margin-bottom: 10px; }
    .match { font-size: 13px; color: #64748b; border-left: 3px solid #cbd5e1; padding-left: 10px; margin-bottom: 12px; }
    .match strong { display: block; font-size: 11px; text-transform: uppercase; color: #94a3b8; margin-bottom: 2px; letter-spacing: .4px; }
    .verdict-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .verdict-btn {
      border: 2px solid #e2e8f0; background: #f8fafc; color: #475569;
      font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 8px;
      cursor: pointer; transition: all .15s;
    }
    .verdict-btn:hover { border-color: #94a3b8; background: #fff; }
    .verdict-btn.selected-yes  { background: #dcfce7; border-color: #16a34a; color: #166534; }
    .verdict-btn.selected-partial { background: #fef9c3; border-color: #ca8a04; color: #854d0e; }
    .verdict-btn.selected-no   { background: #fee2e2; border-color: #dc2626; color: #991b1b; }
    .comment-input {
      display: none; width: 100%; margin-top: 10px; padding: 8px 12px;
      border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; resize: vertical;
      min-height: 60px; font-family: inherit;
    }
    .comment-input.visible { display: block; }
    .save-btn {
      display: none; margin-top: 8px; background: #3b82f6; color: #fff;
      border: none; padding: 7px 18px; border-radius: 6px; font-size: 13px;
      font-weight: 600; cursor: pointer;
    }
    .save-btn.visible { display: inline-block; }
    .save-btn:hover { background: #2563eb; }
    .saved-badge { display: none; margin-top: 8px; font-size: 12px; color: #16a34a; font-weight: 600; }
    .saved-badge.visible { display: block; }
    .actions { display: flex; gap: 12px; margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    .action-btn {
      padding: 10px 22px; border-radius: 8px; font-size: 14px; font-weight: 600;
      cursor: pointer; border: none;
    }
    .action-export { background: #0f172a; color: #fff; }
    .action-export:hover { background: #1e293b; }
    .action-clear { background: #f1f5f9; color: #64748b; }
    .action-clear:hover { background: #e2e8f0; }
    .progress-bar-wrap { background: #e2e8f0; height: 8px; border-radius: 4px; margin-bottom: 6px; }
    .progress-bar { height: 100%; border-radius: 4px; background: #3b82f6; }
    .progress-label { font-size: 12px; color: #64748b; margin-bottom: 20px; }
    footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center; }
    @media(max-width:600px) { body { padding: 14px; } .verdict-row { flex-direction: column; } }
  </style>
</head>
<body>
  <header>
    <h1>Participant Verification</h1>
    <p>
      Project: <strong>${data.config.datasetName}</strong> &bull;
      ${data.participants.length} participants &bull;
      Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </p>
  </header>

  <div class="summary-box">
    <strong>AI-Generated Summary (under review)</strong>
    ${data.summary}
  </div>

  <div id="progress-area">
    <div class="progress-bar-wrap"><div class="progress-bar" id="progress-bar" style="width:0%"></div></div>
    <div class="progress-label" id="progress-label">0 of ${data.participants.length} verified</div>
  </div>

  <div id="cards">
    ${participantData
      .map(
        (p, i) => `
    <div class="participant-card" id="card-${i}">
      <div class="p-header">
        <div class="p-id">${p.id}</div>
        <div class="score-badge ${
          p.status === 'well-represented'
            ? 'score-well'
            : p.status === 'at-risk'
            ? 'score-risk'
            : 'score-under'
        }">
          ${Math.round(p.score * 100)}% match
        </div>
      </div>
      <div class="quote">"${p.text}"</div>
      ${
        p.matchedSentence
          ? `<div class="match"><strong>Closest summary sentence</strong>"${p.matchedSentence}"</div>`
          : ''
      }
      <div class="verdict-row">
        <button class="verdict-btn" data-idx="${i}" data-verdict="yes" onclick="selectVerdict(${i},'yes')">
          ✓ Yes, captured well
        </button>
        <button class="verdict-btn" data-idx="${i}" data-verdict="partial" onclick="selectVerdict(${i},'partial')">
          ≈ Partially captured
        </button>
        <button class="verdict-btn" data-idx="${i}" data-verdict="no" onclick="selectVerdict(${i},'no')">
          ✗ Not captured
        </button>
      </div>
      <textarea class="comment-input" id="comment-${i}" placeholder="Optional: What was missed or misrepresented?"></textarea>
      <button class="save-btn" id="save-${i}" onclick="saveResponse(${i})">Save response</button>
      <div class="saved-badge" id="saved-${i}">✓ Response saved</div>
    </div>`
      )
      .join('')}
  </div>

  <div class="actions">
    <button class="action-btn action-export" onclick="exportResponses()">Export Responses (JSON)</button>
    <button class="action-btn action-clear" onclick="clearAll()">Clear All</button>
  </div>

  <footer>
    Generated by Co-Creation Provenance Lab &bull; Responses stored locally in this browser only
  </footer>

  <script>
    const PARTICIPANTS = ${escapeJson(participantData)};
    const STORAGE_KEY = 'cprov_verification_${encodeURIComponent(data.config.datasetName)}_${Date.now().toString(36)}';

    // ── Load existing responses ──────────────────────────────────────────────
    let responses = {};
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) responses = JSON.parse(stored);
    } catch(e) {}

    // Restore UI state
    window.addEventListener('DOMContentLoaded', function() {
      Object.keys(responses).forEach(function(idx) {
        const r = responses[idx];
        applyVerdict(+idx, r.verdict);
        if (r.comment) {
          const ta = document.getElementById('comment-' + idx);
          if (ta) { ta.value = r.comment; ta.classList.add('visible'); }
        }
        const sb = document.getElementById('saved-' + idx);
        const saveBtn = document.getElementById('save-' + idx);
        if (sb) sb.classList.add('visible');
        if (saveBtn) saveBtn.classList.add('visible');
      });
      updateProgress();
    });

    // ── Verdict selection ────────────────────────────────────────────────────
    function selectVerdict(idx, verdict) {
      applyVerdict(idx, verdict);
      // Show comment box and save button
      const ta = document.getElementById('comment-' + idx);
      const saveBtn = document.getElementById('save-' + idx);
      if (ta) ta.classList.add('visible');
      if (saveBtn) saveBtn.classList.add('visible');
      // Auto-save verdict immediately
      if (!responses[idx]) responses[idx] = {};
      responses[idx].verdict = verdict;
      responses[idx].participantId = PARTICIPANTS[idx].id;
      persist();
      updateProgress();
    }

    function applyVerdict(idx, verdict) {
      const btns = document.querySelectorAll('[data-idx="' + idx + '"]');
      btns.forEach(function(btn) {
        btn.classList.remove('selected-yes', 'selected-partial', 'selected-no');
      });
      const target = document.querySelector('[data-idx="' + idx + '"][data-verdict="' + verdict + '"]');
      if (target) target.classList.add('selected-' + verdict);
    }

    function saveResponse(idx) {
      const ta = document.getElementById('comment-' + idx);
      if (!responses[idx]) responses[idx] = { participantId: PARTICIPANTS[idx].id };
      responses[idx].comment = ta ? ta.value : '';
      responses[idx].timestamp = new Date().toISOString();
      persist();
      const sb = document.getElementById('saved-' + idx);
      const saveBtn = document.getElementById('save-' + idx);
      if (sb) sb.classList.add('visible');
      if (saveBtn) saveBtn.classList.remove('visible');
    }

    function persist() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(responses)); } catch(e) {}
    }

    function updateProgress() {
      const done = Object.keys(responses).length;
      const total = PARTICIPANTS.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const bar = document.getElementById('progress-bar');
      const label = document.getElementById('progress-label');
      if (bar) bar.style.width = pct + '%';
      if (label) label.textContent = done + ' of ' + total + ' verified';
    }

    // ── Export ───────────────────────────────────────────────────────────────
    function exportResponses() {
      const output = {
        exportedAt: new Date().toISOString(),
        datasetName: ${JSON.stringify(data.config.datasetName)},
        totalParticipants: PARTICIPANTS.length,
        responses: Object.values(responses)
      };
      const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'verification-responses-' + new Date().toISOString().split('T')[0] + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function clearAll() {
      if (!confirm('Clear all saved responses?')) return;
      responses = {};
      persist();
      location.reload();
    }
  </script>
</body>
</html>`.trim();
};

// ─── Download helper ──────────────────────────────────────────────────────────

export const downloadVerificationPage = (data: AnalysisResult): void => {
  const html = generateVerificationHTML(data);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `participant-verification-${data.config.datasetName
    .replace(/\s+/g, '-')
    .toLowerCase()}-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
