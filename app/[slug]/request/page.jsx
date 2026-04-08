import { notFound } from "next/navigation"
import { RemoteTutorialPage } from "../../../components/remote-tutorial-page"
import {
  getTutorialBySlug,
  tutorialSlugs,
} from "../../../lib/tutorial-registry"

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
    title: `${tutorial.meta.title} Request`,
    description: `Fetch the payload for ${tutorial.meta.title} and render it in the generic tutorial shell.`,
  }
}

export default async function RemoteTutorialRoute({ params }) {
  const { slug } = await params
  const tutorial = getTutorialBySlug(slug)

  if (!tutorial) {
    notFound()
  }

  return <RemoteTutorialPage slug={slug} title={tutorial.meta.title} />
}
