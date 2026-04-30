# Levelyst AI Interface

Levelyst AI Interface is a Next.js game prototyping workspace with two public surfaces:

- GitHub Pages serves a static portfolio-style showcase.
- Vercel serves the full interactive app with anonymous per-browser project persistence.

The app now supports three deployment modes:

- `local`: SQLite-backed development on your machine
- `public`: Neon-backed hosted app for portfolio visitors with browser-scoped saves
- `demo`: read-only fallback mode for emergencies

## Requirements

- Node.js 22 or newer
- npm

## Local Development

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Validate the project:

   ```bash
   npm run build
   npm test
   npm run typecheck
   npm run build:pages
   ```

## Grad Show Local Windows Setup

For the exhibition, the safest setup is to run the full app on the Windows PC instead of the hosted Vercel URL. Hosted mode still needs Wi-Fi because the browser sends prompt, generation, project, and database requests to the hosted server. Local mode uses the local Next.js server and SQLite, so prototype generation does not need Wi-Fi after dependencies are installed.

Recommended setup in PowerShell:

```powershell
git clone git@github.com:DaFrostyTips/levelyst-ai-interface.git
cd levelyst-ai-interface
npm ci
Copy-Item .env.example .env.local
notepad .env.local
```

Use these exhibition-safe values in `.env.local`:

```env
LEVELYST_DEPLOY_MODE=local
LEVELYST_PLANNER_PROVIDER=rule_based
LEVELYST_DB_PATH=.levelyst/levelyst.sqlite
LEVELYST_LOCAL_AI_MODE=off
```

Build once before the show:

```powershell
npm run build
```

Run the local app during the show:

```powershell
npm run start
```

Open the main monitor at `http://localhost:3000/kiosk/`. Open the presentation monitor from the app’s presentation button, or use the generated `/present/[projectId]/` URL. Keep both windows in the same browser profile so BroadcastChannel and the localStorage presentation fallback can sync instantly.

OpenAI and Ollama are optional for this flow. Leave `LEVELYST_PLANNER_PROVIDER=rule_based` and `LEVELYST_LOCAL_AI_MODE=off` unless you intentionally want to test those layers.

## Environment Contract

`.env.example` documents every supported variable. The important production contract is:

- `LEVELYST_DEPLOY_MODE=public`
- `LEVELYST_PLANNER_PROVIDER=rule_based`
- `LEVELYST_OPENAI_MODEL=gpt-5-mini`
- `DATABASE_URL` for Neon Postgres
- `LEVELYST_KIOSK_SECRET` for protected grad-show kiosk access

Public mode saves projects anonymously per browser using the `levelyst_session` cookie. Visitors do not need an account, but projects do not sync across devices.

Kiosk mode is available at `/kiosk?token=YOUR_SECRET`. A valid token sets a kiosk cookie, unlocks the exhibit shell, raises AI limits, and enables the idle auto-reset flow.

Local Ollama remains optional and local-only. When `LEVELYST_LOCAL_AI_MODE=copy_only` is enabled and Ollama is running, local development can use it to improve wording around rule-based planning. If Ollama is offline, the app falls back cleanly to deterministic copy.

## GitHub Pages

GitHub Pages does not deploy the full Next.js app. Instead, this repo builds a lightweight static showcase:

```bash
npm run build:pages
```

That command generates `pages-dist/` and copies the preview assets used by the landing page. The workflow lives in [`.github/workflows/deploy-pages.yml`](/Users/adenjoseph/Desktop/Levelyst AI Interface/.github/workflows/deploy-pages.yml).

`out/` is treated as stale generated output and is not the Pages deploy source.

## Vercel

The intended public Vercel configuration is:

```bash
LEVELYST_DEPLOY_MODE=public
LEVELYST_PLANNER_PROVIDER=rule_based
LEVELYST_OPENAI_MODEL=gpt-5-mini
```

Before deploying or redeploying with those defaults, set these required secrets in Vercel:

- `DATABASE_URL`
- `LEVELYST_KIOSK_SECRET`

Optional for later hardening, but not required for launch:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

`OPENAI_API_KEY` is not required for the hosted public rollout in this configuration.

In `public` mode:

- visitors can create, edit, save, and generate projects directly from the hosted URL
- projects are scoped to one browser session
- prompt planning uses the deterministic rule-based planner
- prompt requests are only rate-limited if Upstash is configured
- `/present/[projectId]` remains session-scoped

In `demo` mode:

- read routes stay available
- write and generation routes return `403`
- the UI shows a read-only banner

## GitHub Publishing

Target repository:

- Owner: `DaFrostyTips`
- Name: `levelyst-ai-interface`
- Visibility: `public`

Recommended flow:

1. Push `main` to GitHub.
2. Install the Vercel GitHub App for the repo.
3. Add the required Vercel environment variables.
4. Trigger a production deploy.
5. Use the Vercel URL as the live portfolio app and GitHub Pages as the static showcase.
