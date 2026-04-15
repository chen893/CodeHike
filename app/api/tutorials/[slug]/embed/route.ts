import { NextResponse } from "next/server"
import { getTutorialPageData } from "../../../../../lib/services/tutorial-queries"

export const runtime = "nodejs"

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params

  const tutorial = await getTutorialPageData(slug)
  if (!tutorial) {
    return new NextResponse("Tutorial not found", { status: 404 })
  }

  const html = buildEmbedHtml(tutorial)

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildEmbedHtml(tutorial: {
  title: string
  description: string
  steps: Array<{
    id?: string
    chapterId?: string
    eyebrow?: string
    title: string
    lead?: string
    paragraphs: string[]
    code?: string
  }>
  intro?: string[]
  fileName?: string
  chapters?: Array<{
    id: string
    title: string
    description?: string
    order: number
    startIndex: number
    endIndex: number
    stepIds: string[]
    stepCount: number
  }>
  stepChapterMeta?: Record<string, {
    chapterId: string
    chapterTitle: string
    chapterDescription?: string
    chapterIndex: number
    totalChapters: number
    stepIndexInChapter: number
    totalStepsInChapter: number
  }>
}) {
  const stepsHtml = tutorial.steps
    .map((step, index) => {
      const eyebrowHtml = step.eyebrow
        ? `<p class="eyebrow">${escapeHtml(step.eyebrow)}</p>`
        : ""
      const leadHtml = step.lead
        ? `<p class="lead">${escapeHtml(step.lead)}</p>`
        : ""
      const paragraphsHtml = step.paragraphs
        .map((p) => `<p class="paragraph">${escapeHtml(p)}</p>`)
        .join("\n")
      const codeHtml = step.code
        ? `<div class="code-block"><pre><code>${step.code}</code></pre></div>`
        : ""

      // Insert chapter divider if this is the first step in a chapter (skip chapter 0)
      let chapterHeaderHtml = ""
      if (tutorial.stepChapterMeta && step.id) {
        const meta = tutorial.stepChapterMeta[step.id]
        if (meta && meta.stepIndexInChapter === 0 && meta.chapterIndex > 0) {
          chapterHeaderHtml = `
        <div class="chapter-header">
          <div class="chapter-divider-line"></div>
          <span class="chapter-label">Chapter ${meta.chapterIndex + 1} of ${meta.totalChapters}</span>
          <div class="chapter-divider-line"></div>
          <h2 class="chapter-heading">${escapeHtml(meta.chapterTitle)}</h2>
          ${meta.chapterDescription ? `<p class="chapter-description">${escapeHtml(meta.chapterDescription)}</p>` : ""}
        </div>`
        }
      }

      return `${chapterHeaderHtml}
        <section class="step" id="step-${index}">
          ${eyebrowHtml}
          <h3 class="step-title">${escapeHtml(step.title)}</h3>
          ${leadHtml}
          ${paragraphsHtml}
          ${codeHtml}
        </section>`
    })
    .join("\n")

  const introHtml = tutorial.intro
    ? tutorial.intro
        .map((p) => `<p class="intro-paragraph">${escapeHtml(p)}</p>`)
        .join("\n")
    : ""

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(tutorial.title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #f7f8fa;
      --text: #1e293b;
      --text-muted: #64748b;
      --accent: #2563eb;
      --code-bg: #1e1e2e;
      --border: #e2e8f0;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
      --font-mono: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
    }

    html { scroll-behavior: smooth; }

    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 680px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }

    /* Header */
    .header { margin-bottom: 40px; }
    .header h1 {
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.03em;
      color: var(--text);
    }
    .intro-paragraph {
      margin-top: 12px;
      font-size: 1rem;
      line-height: 1.75;
      color: var(--text-muted);
    }

    /* Steps */
    .step {
      padding: 32px 0 24px;
      border-top: 1px solid var(--border);
    }
    .step:first-of-type { border-top: 2px solid var(--accent); }

    .eyebrow {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--accent);
      margin-bottom: 8px;
    }
    .step-title {
      font-size: clamp(1.25rem, 2.5vw, 1.75rem);
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .lead {
      margin-top: 16px;
      font-size: 1rem;
      font-weight: 500;
      line-height: 1.6;
      color: var(--text);
    }
    .paragraph {
      margin-top: 12px;
      font-size: 0.9375rem;
      line-height: 1.8;
      color: var(--text-muted);
    }

    /* Code blocks */
    .code-block {
      margin-top: 20px;
      border-radius: 8px;
      overflow-x: auto;
      background: var(--code-bg);
    }
    .code-block pre {
      padding: 16px 20px;
      margin: 0;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      color: #cdd6f4;
      white-space: pre;
      overflow-x: auto;
    }
    .code-block code {
      font-family: inherit;
      font-size: inherit;
    }

    /* Syntax highlighting from CodeHike — pass through as-is */
    .code-block .ch-code-line { display: block; }
    .code-block .ch-code-word { color: inherit; }

    /* Chapter headers */
    .chapter-header {
      margin-top: 40px;
      padding: 24px 0 8px;
    }
    .chapter-divider-line {
      display: inline-block;
      width: 40px;
      height: 1px;
      background: var(--border);
      vertical-align: middle;
    }
    .chapter-label {
      display: inline;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #94a3b8;
      margin: 0 8px;
    }
    .chapter-heading {
      margin-top: 12px;
      font-size: clamp(1.25rem, 2.5vw, 1.5rem);
      font-weight: 700;
      line-height: 1.2;
      color: var(--text);
    }
    .chapter-description {
      margin-top: 6px;
      font-size: 0.9375rem;
      line-height: 1.6;
      color: var(--text-muted);
    }

    /* Footer */
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }
    .footer a {
      color: var(--accent);
      text-decoration: none;
    }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>${escapeHtml(tutorial.title)}</h1>
      ${introHtml}
    </header>

    ${stepsHtml}

    <footer class="footer">
      Powered by <a href="/" target="_blank" rel="noopener noreferrer">VibeDocs</a>
    </footer>
  </div>
</body>
</html>`
}
