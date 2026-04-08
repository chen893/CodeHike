import { notFound } from "next/navigation"
import { TutorialScrollyDemo } from "../../components/tutorial-scrolly-demo"
import { buildTutorialSteps } from "../../lib/tutorial-assembler"
import {
  getTutorialBySlug,
  tutorialSlugs,
} from "../../lib/tutorial-registry"

export function generateStaticParams() {
  return tutorialSlugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const tutorial = getTutorialBySlug(slug)

  if (!tutorial) {
    return {
      title: "Tutorial Not Found",
    }
  }

  return {
    title: tutorial.meta.title,
    description: tutorial.meta.description,
  }
}

export default async function TutorialPage({ params }) {
  const { slug } = await params
  const tutorial = getTutorialBySlug(slug)

  if (!tutorial) {
    notFound()
  }

  const steps = await buildTutorialSteps(tutorial)

  return (
    <main className="tutorial-page">
      <TutorialScrollyDemo
        steps={steps}
        intro={tutorial.intro.paragraphs}
        title={tutorial.meta.title}
        fileName={tutorial.meta.fileName}
      />
    </main>
  )
}
