# Levelyst AI Interface

Levelyst AI Interface is a Next.js game prototyping workspace with two public deployment surfaces:

- GitHub Pages hosts a static showcase site.
- Vercel hosts the interactive Next.js app in a demo-safe, read-only mode.

The app supports a full local mode for development and a public demo mode that avoids paid AI usage and local SQLite writes.

## Requirements

- Node.js 22 or newer
- npm

## Local Development

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create local env vars:

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
   ```

## Environment Variables

`.env.example` documents the supported variables. The important deployment contract is:

- `LEVELYST_DEPLOY_MODE=local` for the full local SQLite-backed experience
- `LEVELYST_DEPLOY_MODE=demo` for the public read-only deployment
- `LEVELYST_PLANNER_PROVIDER=rule_based` for public demo deployments
- `OPENAI_API_KEY` should be set only for local OpenAI-backed planning, not for the public demo

Recommended public demo settings on Vercel:

```bash
LEVELYST_DEPLOY_MODE=demo
LEVELYST_PLANNER_PROVIDER=rule_based
```

Leave `OPENAI_API_KEY` unset in the public demo.

## GitHub Pages

GitHub Pages does not build the full Next.js app. Instead, this repo generates a separate static showcase artifact with:

```bash
npm run build:pages
```

That command writes a deployable `pages-dist/` directory and copies the preview assets used by the showcase. The Pages workflow lives in `.github/workflows/deploy-pages.yml`.

`out/` is treated as stale generated output and is not used as the Pages deployment source.

## Vercel

Create a new Vercel project named `levelyst-ai-interface` and link it to this repository. Do not reuse the old `v0-levelyst-ai-interface` project.

For the public deployment:

- set `LEVELYST_DEPLOY_MODE=demo`
- set `LEVELYST_PLANNER_PROVIDER=rule_based`
- do not set `OPENAI_API_KEY`

The repository also includes a `vercel.json` with those two non-secret demo defaults so the first deployment does not boot into local SQLite mode by accident.

In demo mode:

- read routes stay available
- write and generation routes return `403`
- the UI shows a read-only demo banner and disables mutating actions

## GitHub Publishing

Target repo:

- Owner: `DaFrostyTips`
- Name: `levelyst-ai-interface`
- Visibility: public

Recommended publish sequence:

1. Create an empty public GitHub repository named `levelyst-ai-interface` under `DaFrostyTips`.
2. Initialize git locally if needed and set the default branch to `main`.
3. Add the GitHub remote.
4. Commit the publish-ready project.
5. Push `main`.
6. Connect the GitHub repo to the new Vercel project.

If repository creation is not available through the current toolchain, step 1 may need to be done manually in GitHub before pushing.
