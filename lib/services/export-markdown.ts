/**
 * Export a TutorialDraft as CommonMark Markdown.
 */

import type { TutorialDraft } from '../schemas/tutorial-draft';
import { applyContentPatches } from '../tutorial/draft-code';
import { normalizeBaseCode } from '../tutorial/normalize';
import { ensureDraftChapters, deriveStepChapterMeta } from '../tutorial/chapters';

export function exportTutorialAsMarkdown(draft: TutorialDraft): string {
  const sections: string[] = [];

  // Ensure chapters are present (handles legacy drafts)
  const normalizedDraft = ensureDraftChapters(draft);

  // Title and description
  sections.push(`# ${normalizedDraft.meta.title}`);
  if (normalizedDraft.meta.description) {
    sections.push('');
    sections.push(`> ${normalizedDraft.meta.description}`);
  }

  // Intro
  if (normalizedDraft.intro?.paragraphs?.length) {
    sections.push('');
    sections.push(...normalizedDraft.intro.paragraphs);
  }

  // Compute code state at each step
  const { files, primaryFile } = normalizeBaseCode(normalizedDraft.baseCode, normalizedDraft.meta);
  let currentFiles: Record<string, string> = { ...files };

  // Base code
  sections.push('');
  sections.push('## Starting Code');
  const baseLang = normalizedDraft.meta.lang || '';
  sections.push(`\`\`\`${baseLang}`);
  sections.push(files[primaryFile] || '');
  sections.push('```');

  // Compute step-chapter metadata to know when chapters start
  const stepChapterMeta = deriveStepChapterMeta(normalizedDraft.chapters, normalizedDraft.steps);
  const totalChapters = normalizedDraft.chapters.length;

  // Steps
  for (let i = 0; i < normalizedDraft.steps.length; i++) {
    const step = normalizedDraft.steps[i];
    const meta = stepChapterMeta[step.id];

    // Insert chapter header if this is the first step in a chapter
    // (show for all chapters when there are multiple, skip for single chapter)
    if (meta && meta.stepIndexInChapter === 0 && totalChapters > 1) {
      sections.push('');
      sections.push(`## Chapter ${meta.chapterIndex + 1}: ${meta.chapterTitle}`);
      if (meta.chapterDescription) {
        sections.push('');
        sections.push(`*${meta.chapterDescription}*`);
      }
    }

    const label = step.eyebrow || `Step ${i + 1}`;

    sections.push('');
    sections.push(`### ${label}: ${step.title}`);

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
