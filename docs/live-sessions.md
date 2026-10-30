# Live sessions

## Optional app mode

The hosted website focuses on the Audit Lab. Its **Live sessions** tab explains how to run the optional workshop app. GitHub Pages cannot run the session server. Download the source from GitHub and run it on your computer or an appropriately configured organizational server.

## Install and run

Install Node.js 22.18 or newer and Git. In a terminal:

```bash
git clone https://github.com/sachit27/co-creation-provenance-lab.git
cd co-creation-provenance-lab
npm ci
npm run build
npm run live:serve
```

Open `http://localhost:5173` and select **Live sessions**. This starts on loopback for a first check on your own computer. Browser provider keys must be entered in the app; local `.env` keys are not injected into the browser.

## Join from phones

Connect phones and the facilitator computer to the same trusted Wi-Fi. Stop the server with Ctrl+C and restart it with network access:

macOS / Linux:

```bash
HOST=0.0.0.0 npm run live:serve
```

Windows PowerShell:

```powershell
$env:HOST="0.0.0.0"; npm run live:serve
```

Create a session, check **Join URL host**, and share the generated link or QR code. Use the computer's detected network address, such as `http://192.168.1.20:5173`, rather than localhost. Keep the app running. If a phone cannot connect, check the firewall and whether the Wi-Fi isolates guest devices; a laptop hotspot or another trusted network may be needed. Do not use router port forwarding to expose this pilot directly to the internet.

`PORT` selects the server port. `LIVE_DATA_DIR` selects storage; the default `.live-data/` is ignored by Git. Save the facilitator recovery key privately and download the session record when finished. For development, `npm run dev` includes the API and Vite proxies; `npm run live:dev` is another development entry point. Rebuild after source updates before running `live:serve`.

## Workflow and visibility

1. The facilitator creates a titled session with one prompt. Save the displayed facilitator recovery key privately. It restores control if the tab closes; anyone with the key can control the session.
2. Participants join by link or QR code. Each browser tab receives a random participation token. No names or identity verification are collected. A participant can edit one response while input is open.
3. The facilitator opens input, sees the count and all responses, then closes input. The participant view sees only its own response. Visible active tabs refresh about every two seconds; hidden tabs and completed participant views refresh less often.
4. After at least three responses, the facilitator chooses the existing summary, embedding, and optional review methods, runs the existing audit, and reviews its summary and measures. The audit runs in the facilitator's browser. Selecting a cloud provider may send the contributions to that provider, as disclosed in the configuration panel.
5. Publication is a separate facilitator action. The server rejects an audit if the input snapshot changed after it ran. Participants see the fixed summary and their personal provenance. A questionnaire appears only when the facilitator explicitly selects **Save and open survey**. Participants can submit it or continue without rating.
6. The facilitator can edit the six-question pilot, its five response labels, question order, and add up to 12 total questions. Custom questions are marked facilitator-authored with an unspecified construct. Saving changed wording creates a new instrument version and digest; older responses remain bound to the wording participants saw.
7. A facilitator can edit a summary draft and select **Audit revised summary**. Publication stays disabled until the revised text is rescored. Each published version receives an immutable ID and digest, points to its parent, and remains in the session export with its full analysis record and revision note.
8. The facilitator sees per-item feedback means and valid response counts for the current summary and instrument. Ratings are never combined into one score. **Download session data** exports the event history, final contributions, every publication and full audit record, revision lineage, method metadata, source-to-summary associations, provisional themes, every questionnaire definition, and raw responses as versioned JSON. Host and participant tokens and their hashes are excluded.

Alignment remains the strongest source-to-summary sentence similarity. It is not proof of agreement, influence, inclusion of every claim, or a participant's satisfaction. Extractive summaries use the existing leave-self-out rule; scores that cannot be independently computed remain unavailable. Gini is descriptive inequality among valid alignment indicators. Theme groups are shown only when the exploratory clustering diagnostics permit downstream use; similarity may still group opposing positions. The facilitator can open the full audit in the existing dashboard; that dashboard is not distributed to participant phones.

## Participant feedback instrument

The starting questionnaire asks separately about summary coverage, meaning accuracy, emphasis, opportunity for voice, facilitation fairness, and understanding of other viewpoints. Each item uses a fully labelled 1–5 scale and offers **Cannot judge**, **Not applicable**, and **Prefer not to answer**. Nothing is preselected. When the unchanged built-in coverage item is **None**, meaning and emphasis are not shown and are stored as `not_shown`. Skipped and nonnumeric answers remain distinct from low ratings.

This is a pilot self-report instrument, not a validated psychometric scale. It does not prove that a summary is representative or that a process is fair. Per-item aggregates use only numeric responses for that item and disclose their valid `n`; missing answers are not imputed. Feedback records also state whether the participant had opened the machine-generated provenance details before submitting.

The JSON export uses `live-session-export-v1`. Survey definitions include exact wording, five anchors, origin, version, locale, and SHA-256 digest. Feedback records bind to both an instrument digest and summary version. It is an unsigned operational record, not a cryptographic authenticity claim. Submission IDs refer to contributions from browser tabs rather than verified people.

## Current limits and deployment

This is a functional local or single-process pilot. Sessions persist as private JSON files and a process handles writes serially. Deploy behind HTTPS and an authenticated reverse proxy before collecting sensitive data or opening to the public. For a multi-instance deployment, replace file storage with a transactional database, add durable facilitator accounts, explicit retention/deletion controls, abuse limits, and organizational privacy review. The current join token identifies a browser tab, not a person; it cannot prevent one person from joining in several tabs. A participant who closes the tab or clears session storage loses their personal view. A facilitator can restore access with the recovery key.

The hosted GitHub Pages build has no session service, so it shows the app setup guide for live mode. The ordinary upload workflow remains available there.

The server checks publication shape and source revision. It does not independently recompute a facilitator browser's analysis. The live export includes the full analysis record for each published version when the facilitator published through the app. Session files retain raw responses and feedback until the operator removes them under the applicable retention policy.

## Product choices informed by existing tools

- [Mentimeter](https://help.mentimeter.com/en/articles/422270-how-to-open-and-close-responses-for-a-specific-slide) exposes presenter control over when responses are accepted.
- [Poll Everywhere](https://support.polleverywhere.com/pe2/qa-open-ended-in-poll-everywhere-2-0) pairs a join QR code with independent controls for locking submissions and showing results.
- [Mentimeter's participant results guidance](https://help.mentimeter.com/en/articles/410888-let-your-audience-view-the-menti-results-after-participating) treats post-participation result access as a separate choice.

The live workflow adopts those interaction patterns, while retaining this project's distinct source-to-summary audit and its methodological limits.
