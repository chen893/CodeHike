import { notFound } from "next/navigation"
import { TutorialScrollyDemo } from "../../components/tutorial-scrolly-demo"
import { CreateCTA } from "../../components/tutorial/create-cta"
import {
  getTutorialMetadata,
  getTutorialPageData,
  listStaticTutorialParams,
} from "@/lib/services/tutorial-queries"
import { generateOgMetadata } from "@/lib/utils/seo"

export function generateStaticParams() {
  return listStaticTutorialParams()
}

// 允许 generateStaticParams 未包含的 slug（如数据库中动态发布的教程）正常渲染
export const dynamicParams = true

export async function generateMetadata({ params }) {
  const { slug } = await params

  const tutorial = await getTutorialMetadata(slug)
  if (!tutorial) {
    return { title: "教程未找到" }
  }

  return {
    title: tutorial.title,
    description: tutorial.description,
    ...generateOgMetadata({
      title: tutorial.title,
      description: tutorial.description,
      slug,
    }),
  }
}

export default async function TutorialPage({ params }) {
  const { slug } = await params

  const tutorial = await getTutorialPageData(slug)
  if (!tutorial) {
    notFound()
  }

  return (
    <main className="min-h-screen">
      <TutorialScrollyDemo
        steps={tutorial.steps}
        intro={tutorial.intro}
        title={tutorial.title}
        fileName={tutorial.fileName}
        slug={slug}
      />
      <CreateCTA slug={slug} />
    </main>
  )
}
