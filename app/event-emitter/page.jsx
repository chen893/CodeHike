import { buildTutorialSteps } from "../../lib/tutorial-assembler"
import { emitterTutorial } from "../../content/build-your-own-eventemitter.tutorial"
import { TutorialScrollyDemo } from "../../components/tutorial-scrolly-demo"

export const metadata = {
  title: "Build Your Own EventEmitter",
  description: "从零构建一个最小 EventEmitter 实现",
}

export default async function EventEmitterPage() {
  const steps = await buildTutorialSteps(emitterTutorial)

  return (
    <main className="tutorial-page">
      <TutorialScrollyDemo
        steps={steps}
        intro={emitterTutorial.intro.paragraphs}
        title={emitterTutorial.meta.title}
        fileName={emitterTutorial.meta.fileName}
      />
    </main>
  )
}
