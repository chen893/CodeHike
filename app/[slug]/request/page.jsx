import { notFound } from "next/navigation"
import { RemoteTutorialPage } from "../../../components/remote-tutorial-page"
import {
  getRemoteTutorialPageData,
  getTutorialMetadata,
  listStaticTutorialParams,
} from "@/lib/services/tutorial-queries"

export function generateStaticParams() {
  return listStaticTutorialParams()
}

// 允许 generateStaticParams 未包含的 slug 正常渲染
export const dynamicParams = true

export async function generateMetadata({ params }) {
  const { slug } = await params
  const tutorial = await getTutorialMetadata(slug)

  if (!tutorial) {
    return {
      title: "教程未找到",
    }
  }

  return {
    title: `${tutorial.title} — 远程加载`,
    description: `加载并渲染教程: ${tutorial.title}`,
  }
}

export default async function RemoteTutorialRoute({ params }) {
  const { slug } = await params
  const tutorial = await getRemoteTutorialPageData(slug)

  if (!tutorial) {
    notFound()
  }

  return <RemoteTutorialPage slug={slug} title={tutorial.title} />
}
