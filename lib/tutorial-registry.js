import { sampleTutorial } from "../content/sample-tutorial"

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
      const meta = getTutorialMetaBySlug(slug)
      if (!meta) return null
      return { slug, title: meta.title, description: meta.description }
    })
    .filter(Boolean)
}
