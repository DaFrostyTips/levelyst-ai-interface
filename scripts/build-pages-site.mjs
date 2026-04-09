import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const outputDir = path.join(repoRoot, "pages-dist")
const publicDir = path.join(repoRoot, "public")

const [defaultOwner, defaultRepo] = (process.env.GITHUB_REPOSITORY ?? "DaFrostyTips/levelyst-ai-interface").split("/")
const repoOwner = defaultOwner || "DaFrostyTips"
const repoName = defaultRepo || "levelyst-ai-interface"
const repoUrl = `https://github.com/${repoOwner}/${repoName}`
const pagesUrl = `https://${repoOwner}.github.io/${repoName}/`
const vercelUrl = process.env.LEVELYST_PUBLIC_VERCEL_URL ?? "https://levelyst-ai-interface.vercel.app"

const previewCards = [
  {
    title: "Forest Temple",
    type: "video",
    mediaSrc: "./previews/forest-temple.mp4",
    posterSrc: "./previews/community/forest-temple-poster.svg",
    description: "A side-scrolling adventure prototype with traversal, combat, and layered level beats.",
  },
  {
    title: "Cyberpunk Alley",
    type: "video",
    mediaSrc: "./previews/cyberpunk-alley.mp4",
    posterSrc: "./previews/community/cyberpunk-alley-poster.svg",
    description: "A neon-soaked action prototype showing off modular systems and rapid iteration.",
  },
  {
    title: "Orbital Breach",
    type: "video",
    mediaSrc: "./previews/orbital-breach.mp4",
    posterSrc: "./previews/community/orbital-breach-poster.svg",
    description: "A 3D survival shooter concept showcasing hosted AI planning, generation, and browser-scoped saves.",
  },
]

const featureList = [
  "Prompt-to-blueprint planning with a fast deterministic rule-based builder in public mode.",
  "Anonymous per-browser persistence backed by Neon Postgres.",
  "Interactive node graph editing, prototype generation, and presentation mode.",
  "Protected kiosk flow with idle reset for grad-show installations.",
]

const steps = [
  "Browse the static showcase on GitHub Pages.",
  "Open the public Vercel deployment to create and edit projects in your browser.",
  "Use the protected kiosk route on the grad-show machine for the auto-reset exhibit flow.",
  "Clone the repo only if you want local development or custom deployment changes.",
]

function renderPreviewCard(card) {
  const media =
    card.type === "video"
      ? `<video class="media" src="${card.mediaSrc}" poster="${card.posterSrc}" autoplay muted loop playsinline controls></video>`
      : `<img class="media" src="${card.mediaSrc}" alt="${card.title}" />`

  return `
    <article class="card">
      <div class="media-shell">
        ${media}
      </div>
      <div class="card-body">
        <h3>${card.title}</h3>
        <p>${card.description}</p>
      </div>
    </article>
  `
}

function renderList(items) {
  return items.map((item) => `<li>${item}</li>`).join("")
}

function renderHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Levelyst AI Interface</title>
    <meta
      name="description"
      content="Levelyst AI Interface is a prompt-to-prototype game design workspace with a GitHub Pages showcase and a full public Vercel app."
    />
    <link rel="icon" href="./icon-light-32x32.png" />
    <style>
      :root {
        color-scheme: dark;
        --bg: #06111f;
        --panel: rgba(10, 24, 43, 0.72);
        --panel-strong: rgba(9, 20, 36, 0.92);
        --text: #eef6ff;
        --muted: #a8c4e6;
        --accent: #4fd1c5;
        --accent-strong: #3b82f6;
        --border: rgba(168, 196, 230, 0.18);
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(79, 209, 197, 0.22), transparent 34%),
          radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.2), transparent 32%),
          linear-gradient(180deg, #08121f 0%, #040913 100%);
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .shell {
        width: min(1160px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      .hero {
        display: grid;
        gap: 28px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        align-items: center;
        padding: 32px;
        border: 1px solid var(--border);
        border-radius: 28px;
        background: linear-gradient(180deg, rgba(12, 28, 49, 0.88), rgba(6, 16, 31, 0.92));
        box-shadow: var(--shadow);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid rgba(79, 209, 197, 0.28);
        background: rgba(79, 209, 197, 0.1);
        color: #c7fff9;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 16px 0 12px;
        font-size: clamp(2.5rem, 5vw, 4.5rem);
        line-height: 0.95;
      }

      .hero p,
      .section-copy,
      li {
        color: var(--muted);
        line-height: 1.7;
        font-size: 1rem;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 14px;
        border: 1px solid transparent;
        font-weight: 600;
        transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
      }

      .button:hover {
        transform: translateY(-1px);
      }

      .button-primary {
        background: linear-gradient(135deg, var(--accent-strong), #7c3aed);
        color: white;
      }

      .button-secondary {
        border-color: rgba(168, 196, 230, 0.22);
        background: rgba(255, 255, 255, 0.04);
      }

      .hero-panel {
        padding: 22px;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: var(--panel);
      }

      .hero-panel img {
        display: block;
        width: 100%;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: var(--panel-strong);
      }

      .grid {
        display: grid;
        gap: 20px;
      }

      .section {
        margin-top: 24px;
        padding: 28px;
        border-radius: 24px;
        border: 1px solid var(--border);
        background: rgba(9, 21, 38, 0.78);
      }

      .section h2 {
        margin: 0 0 10px;
        font-size: 1.5rem;
      }

      .two-up {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      ul {
        margin: 14px 0 0;
        padding-left: 20px;
      }

      .gallery {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        margin-top: 18px;
      }

      .card {
        overflow: hidden;
        border-radius: 22px;
        border: 1px solid var(--border);
        background: var(--panel);
      }

      .media-shell {
        aspect-ratio: 16 / 10;
        background: #02060c;
      }

      .media {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .card-body {
        padding: 18px;
      }

      .card-body h3 {
        margin: 0 0 8px;
        font-size: 1.05rem;
      }

      .footer {
        margin-top: 24px;
        text-align: center;
        color: var(--muted);
        font-size: 0.95rem;
      }

      code {
        padding: 2px 6px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
      }

      @media (max-width: 680px) {
        .shell {
          width: min(100% - 20px, 1160px);
          padding-top: 20px;
        }

        .hero,
        .section {
          padding: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div>
          <span class="badge">Public Showcase + App</span>
          <h1>Levelyst AI Interface</h1>
          <p>
            A prompt-to-prototype workspace for building game concepts, reviewing AI blueprints,
            and exploring modular systems in an engine-like editor. This Pages site is the static
            overview, and the live public app runs separately on Vercel with browser-scoped saves.
          </p>
          <div class="hero-actions">
            <a class="button button-primary" href="${vercelUrl}">Open Live App</a>
            <a class="button button-secondary" href="${repoUrl}">View GitHub Repo</a>
            <a class="button button-secondary" href="${pagesUrl}">GitHub Pages URL</a>
          </div>
        </div>
        <aside class="hero-panel">
          <img src="./previews/community/orbital-breach-poster.svg" alt="Levelyst showcase preview" />
          <p class="section-copy">
            Public deployments are intentionally split: GitHub Pages hosts a static project overview,
            while Vercel hosts the full interactive Next.js app.
          </p>
        </aside>
      </section>

      <section class="section grid two-up">
        <div>
          <h2>What’s Included</h2>
          <p class="section-copy">
            The public Vercel build is designed for <code>LEVELYST_DEPLOY_MODE=public</code> with
            rule-based planning, anonymous browser sessions, and persistent project data stored
            outside the local filesystem.
          </p>
        </div>
        <div>
          <h2>How to Explore</h2>
          <ul>${renderList(steps)}</ul>
        </div>
      </section>

      <section class="section">
        <h2>Key Features</h2>
        <ul>${renderList(featureList)}</ul>
      </section>

      <section class="section">
        <h2>Preview Gallery</h2>
        <p class="section-copy">
          These preview assets are copied from the main app into the Pages artifact so the showcase
          stays lightweight and works independently of the Next.js deployment.
        </p>
        <div class="grid gallery">
          ${previewCards.map(renderPreviewCard).join("")}
        </div>
      </section>

      <p class="footer">
        Repo target: <a href="${repoUrl}">${repoOwner}/${repoName}</a>
      </p>
    </main>
  </body>
</html>`
}

function renderNotFoundHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Levelyst AI Interface</title>
    <meta http-equiv="refresh" content="0; url=${pagesUrl}" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #06111f;
        color: #eef6ff;
        font-family: "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      }

      a {
        color: #7dd3fc;
      }
    </style>
  </head>
  <body>
    <p>Redirecting to the Levelyst showcase. If nothing happens, <a href="${pagesUrl}">open it here</a>.</p>
  </body>
</html>`
}

async function copyPublicAsset(relativePath) {
  await cp(path.join(publicDir, relativePath), path.join(outputDir, relativePath), { recursive: true })
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

await copyPublicAsset("previews")
await copyPublicAsset("icon.svg")
await copyPublicAsset("icon-dark-32x32.png")
await copyPublicAsset("icon-light-32x32.png")
await copyPublicAsset("apple-icon.png")

await writeFile(path.join(outputDir, ".nojekyll"), "")
await writeFile(path.join(outputDir, "index.html"), renderHtml())
await writeFile(path.join(outputDir, "404.html"), renderNotFoundHtml())

console.log(`Built GitHub Pages showcase in ${outputDir}`)
