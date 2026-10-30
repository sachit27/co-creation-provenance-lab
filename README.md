<div align="center">

<img src="public/logo-new.svg" alt="Provenance Lab mark" width="88" />

# Provenance Lab

**Whose views are reflected in the AI summary?**

Participatory provenance for AI-assisted synthesis across research, consultations, policy workshops, and organizational feedback. Trace source connections, review automated assessments, gather participant feedback, and document revisions.

[![Open the demonstration](https://img.shields.io/badge/Open_demonstration-GitHub_Pages-2563eb?style=for-the-badge&logo=github)](https://sachit27.github.io/apps/provenance-lab/)

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

</div>

<p align="center"><img src="docs/images/landing-mobile-2026-10-30.jpg" alt="Provenance Lab landing page showing the central question and options to explore a demo, review existing material, or start a live session" width="380" /></p>

*Current local landing page, captured 30 October 2026. The GitHub Pages copy may differ until the separate hosting repository is updated.*

## Purpose

Provenance Lab audits how a summary relates to a collection of source contributions. It records how a run was executed, computes source-to-summary semantic-alignment indicators, and presents evidence for review at participant, sentence, claim, group, and discourse levels.

The application does **not** establish authorship, causal influence, factual entailment, fairness, or a participant's internal emotional state. Similarity links and model-coded labels are review evidence. They are not verified derivations or human judgments.

## Saved demonstration and hosting

The repository includes a precomputed audit of a 40-record synthetic nature-based-solutions consultation. The contributions cover urban heat and canopy, stormwater and flooding, habitat and biodiversity, and equitable community stewardship. The artifact was produced through the same production pipeline used by a new browser analysis with:

- `gpt-4o-mini` for summary generation
- `gpt-4o-mini` for automated model-coded review
- `text-embedding-3-small` for semantic embeddings

The run recovered four groups after the documented internal validity gates, contains proper cross-group connector candidates with both within-group and cross-group retained links, and includes exact-span tension candidates. The tension screen covered all 40 records in this fixture. Starting a **New Analysis** loads the same raw tutorial records and reruns them with the user's selected methods. The fixture and its precomputed output demonstrate workflow states; they are not evaluation evidence or external validation. Generation and automated review used the same model in this artifact, which is recorded in its run manifest and limits independence.

The GitHub Pages version is static and has no live session backend or shared server-side API keys. Running a new analysis requires a compatible browser-direct provider, a safely configured Ollama endpoint, or a local installation. Browser-entered credentials are stored only in the current tab's `sessionStorage`, but they remain accessible to the page's JavaScript and browser extensions.

## Workflow

1. **Ingest sources.** Use a sample dataset, paste text, upload CSV/TSV/TXT, provide multiple documents, or split a single document.
2. **Declare the summary origin.** Generate a summary with a configured model, create a deterministic extractive summary, or paste an existing summary and record its known provenance.
3. **Choose methods.** Configure the generator, automated evaluator, and embedding method separately. The run manifest records requested and effective methods and available provider metadata.
4. **Run the core audit.** The application segments the summary, embeds sources and summary sentences, computes maximum-sentence semantic alignment, and reports descriptive inequality and source-space diagnostics.
5. **Run optional automated reviews.** When an evaluator is available, the application can assess source-unit transformations, affective expression, claim evidence, sampled tensions, rhetoric markers, and graph entities. Missing or malformed model outputs remain explicit.
6. **Inspect and export.** Review participants and evidence, revise a summary, collect locally returned participant responses, export an HTML report, or create an unsigned PROV-aligned JSON-LD record with integrity digests.

### Live workshop mode

The app can collect contributions in a shared session when run with a session server. Run `npm run live:dev`, open the app, and choose **Start a Live Session**. The facilitator shares the generated link or QR code, opens input, reviews and closes it, runs the existing audit, and explicitly publishes a short result. Participants see their own submission and published results. Published visual data can include pseudonymous per-contribution metrics and relationships; summaries may quote contributions. This is not anonymous data. The public static demonstration cannot host live sessions. See [live session setup, privacy boundaries, and deployment notes](docs/live-sessions.md).

The [product and research review](docs/product-roadmap.md) lists the remaining work for public deployment, accessible facilitation, and empirical calibration.

## Interface

The audit lab groups analytical views by the question they help answer. Views that require additional evidence show their availability and limitations.

| Workspace | Views | Interpretation |
|---|---|---|
| Review inclusion | Audit overview, Evidence review queue, Alignment quadrants, Uncertainty, Group comparison | Descriptive alignment levels, inequality, resampling stability, and configured-group differences |
| Explore the discussion | Discussion map, Similar contributions, Topics and relationships | Source-space geometry and model-extracted concepts; clustering appears only after internal validity gates pass |
| Trace summary evidence | Contribution matches, Association map, Claim evidence, Sentence–source similarity | Semantic retrieval candidates and model-coded evidence for inspection, without causal or citation claims |
| Review changes and sensitivity | Revision history, Source-unit transformation, Tension mapping, Language–alignment association, Input sensitivity, Strategy comparison | Optional transformation and discourse reviews plus descriptive source-space and strategy analyses |

Additional workflow panels support summary revision, participant-response import/export, facilitation suggestions, and budgeted counterfactual utility attribution. Cluster-level functions are disabled when no partition passes the documented gates.

## Core measures and boundaries

For source vector `p_i` and summary-sentence vectors `s_k`, the representation indicator is `R_i = max_k max(0, cosine(p_i, s_k))`. It measures the strongest sentence-level semantic similarity found for each source. It does not measure whether the summary agrees with the source, whether the source caused the wording, or whether every claim in a long source was retained.

- **Gini coefficient** describes inequality among valid alignment indicators.
- **Participant resampling** describes stability under resampling of the observed records. It is not automatically a population confidence interval.
- **Alignment quadrants** use a descriptive median split of source centrality and alignment.
- **Sensitivity (LOO)** measures movement of the source-space centroid when one record is removed. It is not influence on the generated summary.
- **Clustering** reports a partition only after sample-size, separation, minimum-size, restart, subsample, neighborhood, method-sensitivity, and projection checks pass.
- **Affective-expression review** compares model-coded, target-aware profiles of observable text. It does not infer a person's emotions and is not a generic emotion-smoothing score.
- **Counterfactual utility attribution** evaluates a defined stochastic summary-coverage utility. It is not causal identification from observational data.

The full definitions and limitations are in [docs/methodology.md](docs/methodology.md).

## Local installation

Requirements: Node.js 18 or newer.

```bash
git clone https://github.com/sachit27/co-creation-provenance-lab.git
cd co-creation-provenance-lab
npm install
npm run dev
```

Open `http://localhost:5173`.

No API key is required for sample data, manual or extractive summaries, and the built-in TF-IDF baseline. Model-coded enrichment requires a working evaluator. Local Vite development proxies Ollama at `http://localhost:11434` and PublicAI/Apertus requests to avoid browser cross-origin restrictions.

### Optional local dense embeddings

```bash
pip install -r requirements-embedding.txt
python embedding_server.py
```

This starts the local BGE-M3 service. Its suitability still needs validation for the intended language and domain.

### Verification

```bash
npm run verify
```

This runs the deterministic regression suite, TypeScript checks, and the production build. The separate empirical research evaluation is intentionally maintained outside the public GitHub repository.

### Rebuild the bundled demonstration

With the documented Ollama models installed:

```bash
OLLAMA_HOST=http://127.0.0.1:11434 npm run demo:generate
```

Or, with an OpenAI key in the current shell:

```bash
DEMO_PROVIDER=openai \
DEMO_EVALUATOR_PROVIDER=openai \
DEMO_EMBEDDING_PROVIDER=openai \
DEMO_GENERATOR_MODEL=gpt-4o-mini \
DEMO_EVALUATOR_MODEL=gpt-4o-mini \
DEMO_EMBEDDING_MODEL=text-embedding-3-small \
npm run demo:generate
```

The generator writes a candidate file for validation and refuses to accept it if the semantic partition is unavailable, the proper connector set is empty, no exact-span tension candidate survives verification, a required stage fails, or a configured method silently falls back. The artifact is written only after every gate passes.

## Input format

```csv
id,text,group
P1,"We need more green spaces in the city center",community
P2,"Budget constraints limit infrastructure expansion",government
P3,"Mixed-use development could address both concerns",business
```

`id` and `group` are optional. The interface previews detected columns and preprocessing decisions before analysis. Data cleaning is consequential: inspect excluded records and preserve question context when short answers depend on it.

## Providers and data destinations

| Method | Generation | Embeddings | Where data goes |
|---|:---:|:---:|---|
| Ollama | Yes | Yes | Configured Ollama host |
| BGE-M3 service | No | Yes | Configured local or organizational service |
| TF-IDF | No | Yes | Browser only |
| Google Gemini | Yes | Yes | Google API when a user key is supplied |
| OpenAI | Yes | Yes | OpenAI API when a user key is supplied |
| Anthropic Claude | Yes | No | Anthropic API when a user key is supplied |
| Groq | Yes | No | Groq API when a user key is supplied |
| Apertus via PublicAI | Yes | No | PublicAI through the local development proxy; the static hosted demonstration has no relay |

Cloud providers receive the text sent for generation or automated review. Review provider retention, logging, access controls, and organizational policy before processing sensitive material. A local model is private only when its configured host and surrounding infrastructure are controlled appropriately.

## Repository layout

```text
components/       Interface panels and visualizations
services/         Analysis, provider adapters, statistics, and exports
api/              Optional serverless relay handlers; not active on GitHub Pages
public/           Current logo and precomputed demonstration
scripts/          Demo generation, validation, and local simulations
tests/            Deterministic application and live API regression tests
docs/             Methodology and deployment documentation
```

## Citation

If you use this work, please cite:

```bibtex
@article{mahajan2026participatory,
  title={Participatory provenance as representational auditing for AI-mediated public consultation},
  author={Mahajan, Sachit},
  journal={arXiv preprint arXiv:2604.20711},
  year={2026},
  url={https://arxiv.org/abs/2604.20711}
}

@article{mahajan2025measuring,
  title={Participatory Provenance: Measuring Input Transformation in AI-Mediated Collective Synthesis},
  author={Mahajan, Sachit},
  journal={SSRN},
  year={2025},
  url={https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5709064}
}
```

## License

[GNU Affero General Public License v3.0](LICENSE). Contributions are welcome through issues and pull requests.

Author: Sachit Mahajan, [sachitmahajan90@gmail.com](mailto:sachitmahajan90@gmail.com)

## Product evidence and release review

See [product evidence review](docs/product-evidence-review.md) for claim boundaries and public-service release blockers, and [award entry working draft](docs/award-entry-draft.md) for the description and demonstration script. The static audit app and local live pilot have different deployment requirements.

The saved synthetic demo includes a separately scored AI-assisted revision. The local live session service remains a pilot and is not available through GitHub Pages. Use **Compare saved revision** to inspect wording and source-score changes without a provider key. See [the demo refresh record](docs/demo-refresh-2026-10-30.md) for run provenance, checks, and limitations.
