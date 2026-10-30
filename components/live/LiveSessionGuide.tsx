import React from 'react';
import { BrandLogo } from '../ui/BrandLogo';

export function LiveSessionGuide() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <a href={import.meta.env.BASE_URL} aria-label="Provenance Lab home"><BrandLogo size="md" /></a>
        <div className="flex flex-wrap gap-3 mt-8 text-sm">
          <a href={`${import.meta.env.BASE_URL}?view=dashboard`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-indigo-700">Open Audit Lab</a>
          <span className="rounded-lg bg-indigo-100 px-4 py-2 font-semibold text-indigo-900" aria-current="page">Live sessions · app setup</span>
        </div>
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <p className="text-xs uppercase tracking-widest font-semibold text-indigo-700">Optional workshop mode</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Run a live session with participants</h1>
          <p className="mt-4 text-slate-600 leading-relaxed">The Audit Lab works directly on this website. To collect contributions from phones during a workshop, run the app with its session server on your computer or your organization's server.</p>
          <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
            This website does not host shared sessions. The steps below start your own app. Participants join that app using its link or QR code.
          </div>
          <h2 className="mt-8 text-xl font-bold">1. Download and start the app</h2>
          <p className="mt-2 text-sm text-slate-600">Install Node.js 22.18 or newer and Git, then run these commands in a terminal:</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm text-slate-100"><code>{`git clone https://github.com/sachit27/co-creation-provenance-lab.git
cd co-creation-provenance-lab
npm ci
npm run build
npm run live:serve`}</code></pre>
          <p className="mt-3 text-sm text-slate-600">Open <code className="font-semibold">http://localhost:5173</code> and select <strong>Live sessions</strong>. This first run is available on your computer.</p>
          <h2 className="mt-8 text-xl font-bold">2. Let phones join over shared Wi-Fi</h2>
          <p className="mt-2 text-sm text-slate-600">Stop the server with Ctrl+C, then restart it for your trusted local network:</p>
          <p className="mt-4 text-xs font-semibold text-slate-500">macOS / Linux</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 p-4 text-sm"><code>HOST=0.0.0.0 npm run live:serve</code></pre>
          <p className="mt-4 text-xs font-semibold text-slate-500">Windows PowerShell</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 p-4 text-sm"><code>{'$env:HOST="0.0.0.0"; npm run live:serve'}</code></pre>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">Connect the computer and phones to the same Wi-Fi. Create a session and use the network address shown in the invitation panel. A phone cannot use your computer's localhost address. Keep the app running; guest Wi-Fi isolation or a firewall may block connections.</p>
          <h2 className="mt-8 text-xl font-bold">3. Facilitate, review, and publish</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Save your private recovery key, share the join link, and open input. Close input when ready, run the audit, and inspect the evidence before publishing. Enable and customize a survey only if you want one. Download the complete session record before finishing.</p>
          <p className="mt-4 text-sm text-slate-600">No provider key is needed for manual summaries and local TF-IDF alignment. Enter your own key in the app if you choose a cloud AI provider. Sessions are stored in the app's private <code>.live-data/</code> directory.</p>
          <div className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-600">
            <p>For a public or sensitive-data workshop, use an appropriately configured HTTPS server with access controls. This local session service is a single-process pilot.</p>
            <a href="https://github.com/sachit27/co-creation-provenance-lab/blob/main/docs/live-sessions.md" target="_blank" rel="noreferrer" className="inline-block mt-3 font-semibold text-indigo-700 underline">Full setup, privacy, and troubleshooting guide</a>
          </div>
        </section>
      </div>
    </main>
  );
}
