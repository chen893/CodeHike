/**
 * Export a TutorialDraft as CommonMark Markdown.
 */

import type { TutorialDraft } from '../schemas/tutorial-draft';
import { applyContentPatches } from '../tutorial/draft-code';
import { normalizeBaseCode } from '../tutorial/normalize';

export function exportTutorialAsMarkdown(draft: TutorialDraft): string {
  const sections: string[] = [];

  // Title and description
  sections.push(`# ${draft.meta.title}`);
  if (draft.meta.description) {
    sections.push('');
    sections.push(`> ${draft.meta.description}`);
  }

  // Intro
  if (draft.intro?.paragraphs?.length) {
    sections.push('');
    sections.push(...draft.intro.paragraphs);
  }

  // Compute code state at each step
  const { files, primaryFile } = normalizeBaseCode(draft.baseCode, draft.meta);
  let currentFiles: Record<string, string> = { ...files };

  // Base code
  sections.push('');
  sections.push('## Starting Code');
  const baseLang = draft.meta.lang || '';
  sections.push(`\`\`\`${baseLang}`);
  sections.push(files[primaryFile] || '');
  sections.push('```');

  // Steps
  for (let i = 0; i < draft.steps.length; i++) {
    const step = draft.steps[i];
    const label = step.eyebrow || `Step ${i + 1}`;

    sections.push('');
    sections.push(`## ${label}: ${step.title}`);

    if (step.lead) {
      sections.push('');
      sections.push(`*${step.lead}*`);
    }

    if (step.paragraphs?.length) {
      sections.push('');
      sections.push(...step.paragraphs);
    }

    // Apply patches to get the code state after this step
    if (step.patches && step.patches.length > 0) {
      currentFiles = applyContentPatches(currentFiles, step.patches, primaryFile);
    }

    // Show code after this step
    sections.push('');
    const targetFile = step.patches?.[0]?.file || primaryFile;
    const code = currentFiles[targetFile] || currentFiles[primaryFile] || '';
    sections.push(`\`\`\`${baseLang}`);
    sections.push(code);
    sections.push('```');
  }

  sections.push('');
  sections.push('---');
  sections.push('*Created with [VibeDocs](https://vibedocs.dev)*');

  return sections.join('\n');
}
