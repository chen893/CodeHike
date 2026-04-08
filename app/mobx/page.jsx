import { buildTutorialSteps } from "../../lib/tutorial-assembler"
import { mobxTutorial } from "../../content/build-your-own-mobx.tutorial"
import { TutorialScrollyDemo } from "../../components/tutorial-scrolly-demo"

export const metadata = {
  title: "Build Your Own MobX",
  description: "从零构建一个最小 MobX 响应式系统",
}

export default async function MobxPage() {
  const steps = await buildTutorialSteps(mobxTutorial)

  return (
    <main className="tutorial-page">
      <TutorialScrollyDemo
        steps={steps}
        intro={mobxTutorial.intro.paragraphs}
        title={mobxTutorial.meta.title}
        fileName={mobxTutorial.meta.fileName}
      />
    </main>
  )
}
