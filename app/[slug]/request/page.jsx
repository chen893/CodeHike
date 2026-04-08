import { notFound } from "next/navigation"
import { RemoteTutorialPage } from "../../../components/remote-tutorial-page"
import {
  getTutorialBySlug,
  tutorialSlugs,
} from "../../../lib/tutorial-registry"

export function generateStaticParams() {
  return tutorialSlugs.map((slug) => ({ slug }))
}

// 允许 generateStaticParams 未包含的 slug 正常渲染
export const dynamicParams = true

export async function generateMetadata({ params }) {
  const { slug } = await params
  const tutorial = getTutorialBySlug(slug)

  if (!tutorial) {
    return {
      title: "教程未找到",
    }
  }

  return {
    title: `${tutorial.meta.title} — 远程加载`,
    description: `加载并渲染教程: ${tutorial.meta.title}`,
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
