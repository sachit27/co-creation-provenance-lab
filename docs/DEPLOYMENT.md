

## Security Architecture

```
Browser  ──>  Vercel CDN (static frontend)
                ──>  /api/gemini-embed   (serverless, has API key)
                ──>  /api/gemini-complete (serverless, has API key)
```

- The Gemini API key is **only** on the server side (Vercel environment variable)
- The production JavaScript bundle contains **no API keys**
- The `/api/*` serverless functions proxy requests to Gemini
- The demo data loads instantly without any API calls

## Prerequisites

- GitHub account
- Vercel account (free at vercel.com — sign in with GitHub)
- Gemini API key (free at aistudio.google.com/apikey)

## Step 1: Generate Demo Data

Run the app locally with BGE-M3 + Ollama. Load sample data, enable all features (LOO, Strategy Comparison), and run analysis. When the dashboard loads:

1. Click **"Export as Demo Data"** in the sidebar
2. Move the file into the project:
   ```bash
   mv ~/Downloads/demo-result.json public/demo-result.json
   ```

## Step 2: Create Private GitHub Repository

```bash
cd /path/to/co-creation-provenance-tool

# Create the repo on GitHub (private)
gh repo create co-creation-provenance-lab --private --source=. --push
```

Or manually:
1. Go to github.com/new
2. Name: `co-creation-provenance-lab`
3. Visibility: **Private**
4. Do NOT initialize with README (you already have one)
5. Then:
   ```bash
   git add -A
   git commit -m "Initial commit"
   git remote add origin git@github.com:YOUR_USERNAME/co-creation-provenance-lab.git
   git push -u origin main
   ```

## Step 3: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select your private `co-creation-provenance-lab` repo
4. Vercel auto-detects Vite — no changes needed to build settings
5. **Add environment variable:**
   - Key: `GEMINI_API_KEY`
   - Value: your Gemini API key (starts with `AIza...`)
   - Environment: Production (and optionally Preview)
6. Click **Deploy**

Deployment takes ~60 seconds. You get a URL like:
```
https://co-creation-provenance-lab-xxxxx.vercel.app
```

## Step 4: Verify

1. Open the URL — you should see the demo dashboard immediately
2. Click around: visualizations, info icons, participant details
3. Click "Try Your Own Data" to test live Gemini analysis
4. Export a report to verify that works too

## Step 5: Custom Domain (Optional)

In Vercel dashboard > Settings > Domains, you can add a custom domain or rename the `.vercel.app` subdomain.



## API Key Protection

| Layer | Protection |
|-------|-----------|
| Client bundle | API key is NOT in the JavaScript (verified: empty string at build time) |
| Serverless functions | API key is in Vercel env vars, only accessible server-side |
| Gemini quotas | Free tier: 1,500 requests/day (sufficient for demo, limits abuse) |
| Demo mode | Most users never trigger API calls (pre-loaded data) |

### Additional Gemini API Key Safety

In Google AI Studio, you can add restrictions to your API key:
1. Go to aistudio.google.com/apikey
2. Click on your key
3. Under "API restrictions", you can set:
   - **HTTP referrer restrictions**: Only allow `https://your-app.vercel.app/*`
   - **API restrictions**: Only allow "Generative Language API"



## Troubleshooting

**"API key not configured" error when running analysis:**
Check that `GEMINI_API_KEY` is set in Vercel dashboard > Settings > Environment Variables.

**Demo data not loading:**
Verify `public/demo-result.json` exists and is not empty. It must have valid `participants`, `metrics`, and `summary` fields.

**Build fails on Vercel:**
Ensure `vercel.json` is in the project root. Check that all dependencies are in `package.json`.
