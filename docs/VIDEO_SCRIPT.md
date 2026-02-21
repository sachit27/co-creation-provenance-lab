# Video Script: GenAI Zurich Award 2026

**Track:** Impact Achievers
**Max length:** 3:00
**Format:** Screen recording with voiceover (record in QuickTime/OBS, upload to Google Drive)

---

## Recording Setup

- Have the app running at `localhost:3000` with the 30-participant sample data loaded
- Run a full analysis beforehand so all visualizations are ready
- Browser in full-screen, dark mode looks best on camera
- Record at 1920x1080 or higher

---

## Script

### [0:00 - 0:25] THE PROBLEM (25 sec)
**Evaluation target: Impact (35%)**

> **SHOW:** Title slide or the app's landing state (config panel visible)

**NARRATION:**

"When cities, NGOs, or public institutions run participatory processes — collecting input from dozens or hundreds of citizens — they increasingly rely on AI to summarize those contributions. But here's the problem: how do you know the AI didn't quietly erase minority voices?

If 30 people share their concerns about a city project, and the AI summary only captures what the majority said, the people who needed to be heard most — indigenous communities, people with disabilities, non-native speakers — are the ones most likely to be lost. And no one would even notice."

---

### [0:25 - 0:55] THE SOLUTION (30 sec)
**Evaluation target: Innovation (35%)**

> **SHOW:** Click "Run Analysis" — show the loading state, then the Executive Summary card appearing with the overall score, well-represented count, at-risk count, blind spots count

**NARRATION:**

"The Co-Creation Provenance Lab is an open-source tool that audits AI-generated summaries for representational fairness. You feed it participant inputs and an AI summary, and it tells you — quantitatively — whose voice was captured and whose was lost.

It uses state-of-the-art embeddings — BGE-M3 — to compute semantic similarity between each participant's input and every sentence in the summary. It produces an overall representation score, identifies at-risk participants, and detects blind spots: unique perspectives the AI completely missed."

---

### [0:55 - 1:35] LIVE DEMO (40 sec)
**Evaluation target: Innovation (35%) + Production Readiness (10%)**

> **SHOW:** Scroll through the dashboard. Pause on each visualization for 3-5 seconds:
> 1. Executive Summary card (score, at-risk, blind spots)
> 2. Representation bar chart (per-participant scores)
> 3. Blind Spot Plot (quadrant scatter — point out the bottom-left quadrant)
> 4. Cluster view (thematic groupings)
> 5. Gini coefficient / equity metrics

**NARRATION:**

"Let me walk you through a real analysis. We have 30 citizen inputs about a participatory science project.

The dashboard immediately tells us: 7 of 30 participants are well-represented. The blind spot plot reveals unique perspectives the summary failed to capture — participants with both low centrality and low representation, shown here in the bottom-left quadrant.

Each participant gets an individual score. We can see exactly which voices were heard and which were silenced. The Gini coefficient measures inequality across all scores — just like income inequality, but for representation.

All thresholds are adaptive. At-risk detection uses percentile-based classification. Blind spots use median-based thresholds. Nothing is a hardcoded magic number — the methodology is grounded in published statistical literature."

---

### [1:35 - 2:05] METHODOLOGY & ETHICS (30 sec)
**Evaluation target: Ethical & Responsible AI (10%) + Innovation (35%)**

> **SHOW:** Briefly show the config panel (BGE-M3 active indicator, Ollama provider), then scroll to show the exported HTML report

**NARRATION:**

"The tool is designed to be privacy-first. It runs entirely locally — no data leaves your machine. Embeddings are computed by BGE-M3 running on localhost. Text generation uses Ollama. There's no cloud dependency.

The methodology is fully documented and citable. Every threshold — the 0.6 representation target, the Gini interpretation bands, the bootstrap confidence intervals — is justified with references to Reimers and Gurevych, Dawes, Efron and Tibshirani, and others. This isn't a black box. It's a transparent, auditable tool designed for researchers and policymakers."

---

### [2:05 - 2:35] IMPACT & USE CASES (30 sec)
**Evaluation target: Impact (35%) + Scalability (10%)**

> **SHOW:** The exported HTML report (clean, printable), then briefly show the one-pager or a slide with use case examples

**NARRATION:**

"This tool is built for real-world use. City planners can audit public consultation summaries before they become policy. NGOs running community workshops can verify that marginalized voices weren't lost in AI processing. Academic researchers can use it to study fairness in AI summarization across languages — BGE-M3 supports over 100 languages.

The tool is open-source, runs on standard hardware, and requires no API keys. It works offline with a fallback to local TF-IDF embeddings. It scales from 10 to 100 participants and exports professional reports for decision-makers."

---

### [2:35 - 3:00] CLOSING (25 sec)
**Evaluation target: All criteria — leave a strong final impression**

> **SHOW:** Return to the Executive Summary dashboard view. End on the overall score.

**NARRATION:**

"AI is increasingly mediating how we listen to each other. When we ask an AI to summarize what a community said, we're trusting it to be fair. The Co-Creation Provenance Lab gives us the tools to verify that trust.

Every voice in a co-creation process deserves to be heard. This tool makes sure they are.

Thank you."

---

## Timing Summary

| Section | Duration | Evaluation Criteria |
|---------|----------|-------------------|
| The Problem | 0:00 - 0:25 (25s) | Impact |
| The Solution | 0:25 - 0:55 (30s) | Innovation |
| Live Demo | 0:55 - 1:35 (40s) | Innovation + Production Readiness |
| Methodology & Ethics | 1:35 - 2:05 (30s) | Ethics + Innovation |
| Impact & Use Cases | 2:05 - 2:35 (30s) | Impact + Scalability |
| Closing | 2:35 - 3:00 (25s) | All |
| **Total** | **3:00** | |

## Recording Tips

1. **Practice the narration** 2-3 times to fit the timing. Each section is tight.
2. **Pre-load all views** — don't wait for analysis to run during recording. Have results ready and just navigate.
3. **Use smooth scrolling** — slow, deliberate mouse movements look professional on screen recordings.
4. **Audio quality matters** — use a decent microphone (AirPods Pro work fine), record in a quiet room.
5. **QuickTime Player** (Mac) > File > New Screen Recording is the simplest option. OBS for more control.
6. **Resolution:** Record at your native display resolution. Export at 1080p minimum.
7. **Upload to Google Drive** and set sharing to "Anyone with the link can view" + enable downloading.

## Criteria Coverage Check

| Criterion | Weight | Where Addressed |
|-----------|--------|----------------|
| Innovation | 35% | Solution (BGE-M3, adaptive thresholds, blind spot detection), Demo (visualizations, methodology) |
| Impact | 35% | Problem (why it matters), Use Cases (city planners, NGOs, researchers, 100+ languages) |
| Scalability | 10% | Use Cases (open-source, offline, no API keys, multilingual) |
| Ethics | 10% | Methodology (privacy-first, local-only, transparent, documented thresholds) |
| Production Readiness | 10% | Demo (working tool with real data), Use Cases (exports reports) |
