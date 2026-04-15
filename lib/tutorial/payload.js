import { buildTutorialSteps } from "./assembler.js"
import { deriveChapterSections, deriveStepChapterMeta, ensureDraftChapters } from "./chapters"

export async function buildTutorialPayload(tutorial) {
  // Ensure legacy drafts without chapters are wrapped with a default chapter
  const normalizedDraft = ensureDraftChapters(tutorial)

  const steps = await buildTutorialSteps(normalizedDraft)

  // Compute chapter sections and per-step chapter metadata
  const chapters = deriveChapterSections(normalizedDraft.chapters, normalizedDraft.steps)
  const stepChapterMeta = deriveStepChapterMeta(normalizedDraft.chapters, normalizedDraft.steps)

  return {
    title: tutorial.meta.title,
    description: tutorial.meta.description,
    fileName: tutorial.meta.fileName,
    intro: tutorial.intro.paragraphs,
    steps,
    chapters,
    stepChapterMeta,
  }
}
