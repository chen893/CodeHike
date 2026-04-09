import { cache } from "react"
import { notFound } from "next/navigation"
import { TutorialScrollyDemo } from "../../components/tutorial-scrolly-demo"
import { buildTutorialSteps } from "../../lib/tutorial-assembler"
import {
  getTutorialBySlug,
  tutorialSlugs,
} from "../../lib/tutorial-registry"
import * as draftRepo from "../../lib/repositories/draft-repository"
import * as publishedRepo from "../../lib/repositories/published-tutorial-repository"

// 缓存的教程加载器：同一 render pass 中 generateMetadata 和页面组件共享同一次 DB 查询
const loadPublishedTutorial = cache(async (slug) => {
  try {
    const published = await publishedRepo.getPublishedBySlug(slug)
    return published ?? null
  } catch (err) {
    console.error("加载已发布教程失败:", err)
    return null
  }
})

export function generateStaticParams() {
  return tutorialSlugs.map((slug) => ({ slug }))
}

// 允许 generateStaticParams 未包含的 slug（如数据库中动态发布的教程）正常渲染
export const dynamicParams = true

export async function generateMetadata({ params }) {
  const { slug } = await params

  // 使用缓存的 loader，与页面组件共享同一次 DB 查询
  const published = await loadPublishedTutorial(slug)
  if (published) {
    return {
      title: published.tutorialDraftSnapshot.meta.title,
      description: published.tutorialDraftSnapshot.meta.description,
    }
  }

  // Fallback to registry
  const tutorial = getTutorialBySlug(slug)
  if (!tutorial) {
    return { title: "教程未找到" }
  }

  return {
    title: tutorial.meta.title,
    description: tutorial.meta.description,
  }
}

export default async function TutorialPage({ params }) {
  const { slug } = await params

  // 使用缓存的 loader，与 generateMetadata 共享同一次 DB 查询
  const published = await loadPublishedTutorial(slug)
  if (published) {
    const steps = await buildTutorialSteps(published.tutorialDraftSnapshot)
    return (
      <main className="min-h-screen">
        <TutorialScrollyDemo
          steps={steps}
          intro={published.tutorialDraftSnapshot.intro.paragraphs}
          title={published.tutorialDraftSnapshot.meta.title}
          fileName={published.tutorialDraftSnapshot.meta.fileName}
        />
      </main>
    )
  }

  // Fallback to registry
  const tutorial = getTutorialBySlug(slug)
  if (!tutorial) {
    notFound()
  }

  const steps = await buildTutorialSteps(tutorial)

  return (
    <main className="min-h-screen">
      <TutorialScrollyDemo
        steps={steps}
        intro={tutorial.intro.paragraphs}
        title={tutorial.meta.title}
        fileName={tutorial.meta.fileName}
      />
    </main>
  )
}
