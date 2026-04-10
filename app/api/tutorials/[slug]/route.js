import { NextResponse } from "next/server"
import { getTutorialPayloadData } from "../../../../lib/services/tutorial-queries"

export const runtime = "nodejs"

export async function GET(_request, context) {
  const { slug } = await context.params

  const tutorial = await getTutorialPayloadData(slug)
  if (!tutorial) {
    return NextResponse.json(
      {
        message: `未知的教程 slug: ${slug}`,
      },
      { status: 404 },
    )
  }

  return NextResponse.json(tutorial.payload)
}
