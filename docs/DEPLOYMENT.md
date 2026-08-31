# Deployment

The public application is a static GitHub Pages build at:

<https://sachit27.github.io/apps/provenance-lab/>

The former Vercel deployment is disabled. GitHub Pages serves no `/api/*` backend and contains no shared server-side provider keys.

## Build for the academic website

```bash
VITE_BASE_PATH=/apps/provenance-lab/ npm run build
```

Publish the contents of `dist/` at `/apps/provenance-lab/` in the academic website repository. The bundled demonstration works as static data.

## Capabilities of the static build

- The precomputed demonstration and all client-side visualizations work without a backend.
- Manual and deterministic extractive summaries can use the browser TF-IDF baseline without an API key.
- Browser-direct cloud providers require a user-supplied key and depend on each provider's current CORS policy.
- Ollama requires an explicitly configured, safely restricted endpoint when accessed from the hosted page.
- PublicAI/Apertus uses the Vite proxy during local development. The public static build has no PublicAI relay.
- The optional `api/` handlers are retained as reference code for a separately secured self-hosted deployment. They are not deployed by GitHub Pages.

## Generate the demonstration artifact

```bash
OLLAMA_HOST=http://127.0.0.1:11434 npm run demo:generate
```

The default configuration uses `qwen2.5:14b` for generation, `phi4:14b` for automated review, and `qwen3-embedding:8b` for embeddings. The script refuses to replace `public/demo-result.json` if the semantic partition is unavailable, no cross-group connector candidate is present, required stages fail, or the run silently falls back. The existing tracked artifact is otherwise left untouched.

## Verify before publishing

```bash
npm run verify
VITE_BASE_PATH=/apps/provenance-lab/ npm run build
```

Check that the demo has a run manifest and no raw vectors, the subpath assets load, unavailable stages remain explicit, and no keys or local evaluation data are tracked.
