import { buildTutorialSteps } from "./tutorial-assembler"

export async function buildTutorialPayload(tutorial) {
  const steps = await buildTutorialSteps(tutorial)

  return {
    title: tutorial.meta.title,
    description: tutorial.meta.description,
    fileName: tutorial.meta.fileName,
    intro: tutorial.intro.paragraphs,
    steps,
  }
}
