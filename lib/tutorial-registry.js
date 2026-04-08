import { emitterTutorial } from "../content/build-your-own-eventemitter.tutorial"
import { mobxTutorial } from "../content/build-your-own-mobx.tutorial"

export const tutorialRegistry = {
  mobx: mobxTutorial,
  "event-emitter": emitterTutorial,
}

export const tutorialSlugs = Object.keys(tutorialRegistry)

export function getTutorialBySlug(slug) {
  return tutorialRegistry[slug] ?? null
}

export function getTutorialMetaBySlug(slug) {
  return getTutorialBySlug(slug)?.meta ?? null
}
