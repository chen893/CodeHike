import { NextResponse } from "next/server"
import { buildTutorialPayload } from "../../../../lib/tutorial-payload"
import { getTutorialBySlug } from "../../../../lib/tutorial-registry"
import * as publishedRepo from "../../../../lib/repositories/published-tutorial-repository"

export const runtime = "nodejs"

export async function GET(_request, context) {
  const { slug } = await context.params

  // Try published tutorial from database first
  try {
    const published = await publishedRepo.getPublishedBySlug(slug)
    if (published) {
      const payload = await buildTutorialPayload(published.tutorialDraftSnapshot)
      return NextResponse.json(payload)
    }
  } catch (err) {
    console.error("API 加载已发布教程失败:", err)
  }

  // Fallback to registry
  const tutorial = getTutorialBySlug(slug)

  if (!tutorial) {
    return NextResponse.json(
      {
        message: `未知的教程 slug: ${slug}`,
      },
      { status: 404 },
    )
  }

  const payload = await buildTutorialPayload(tutorial)

  return NextResponse.json(payload)
}
