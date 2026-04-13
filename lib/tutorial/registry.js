import { sampleTutorial } from "../../content/sample-tutorial"

export const tutorialRegistry = {
  sample: sampleTutorial,
}

export const tutorialSlugs = Object.keys(tutorialRegistry)

export function getTutorialBySlug(slug) {
  return tutorialRegistry[slug] ?? null
}

export function getTutorialMetaBySlug(slug) {
  return getTutorialBySlug(slug)?.meta ?? null
}

export function listTutorials() {
  return tutorialSlugs
    .map((slug) => {
      const tutorial = getTutorialBySlug(slug)
      if (!tutorial) return null
      return {
        slug,
        title: tutorial.meta.title,
        description: tutorial.meta.description,
        lang: tutorial.meta.lang || '',
        fileName: tutorial.meta.fileName || '',
        stepCount: tutorial.steps.length,
      }
    })
    .filter(Boolean)
}
