/**
 * Export a TutorialDraft as standalone HTML with inline styles.
 */

import type { TutorialDraft } from '../schemas/tutorial-draft';
import { applyContentPatches } from '../tutorial/draft-code';
import { normalizeBaseCode } from '../tutorial/normalize';
import { escapeHtml } from '../utils/html-escape';

export function exportTutorialAsHtml(draft: TutorialDraft): string {
  const { files, primaryFile } = normalizeBaseCode(draft.baseCode, draft.meta);
  let currentFiles: Record<string, string> = { ...files };
  const lang = draft.meta.lang || '';

  const stepsHtml = draft.steps.map((step, i) => {
    // Apply patches
    if (step.patches && step.patches.length > 0) {
      currentFiles = applyContentPatches(currentFiles, step.patches, primaryFile);
    }

    const targetFile = step.patches?.[0]?.file || primaryFile;
    const code = currentFiles[targetFile] || currentFiles[primaryFile] || '';

    return `
<article>
  <h2>${escapeHtml(step.eyebrow || `Step ${i + 1}`)}: ${escapeHtml(step.title)}</h2>
  ${step.lead ? `<p class="lead"><em>${escapeHtml(step.lead)}</em></p>` : ''}
  ${(step.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  <pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>
</article>`;
  });

  const introHtml = (draft.intro?.paragraphs || [])
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(draft.meta.title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #1e293b; line-height: 1.6; }
    h1 { font-size: 1.875rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.375rem; margin-top: 2rem; color: #334155; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; font-size: 0.875rem; line-height: 1.5; }
    code { font-family: 'Fira Code', 'JetBrains Mono', monospace; }
    .lead { color: #64748b; }
    .description { color: #64748b; margin-bottom: 1.5rem; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 0.75rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(draft.meta.title)}</h1>
  ${draft.meta.description ? `<p class="description">${escapeHtml(draft.meta.description)}</p>` : ''}
  ${introHtml}
  ${stepsHtml.join('\n')}
  <footer>Created with <a href="https://vibedocs.dev">VibeDocs</a></footer>
</body>
</html>`;
}
