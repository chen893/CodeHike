import { NextResponse } from "next/server"
import { buildTutorialPayload } from "../../../../lib/tutorial-payload"
import { getTutorialBySlug } from "../../../../lib/tutorial-registry"

export const runtime = "nodejs"

export async function GET(_request, context) {
  const { slug } = await context.params
  const tutorial = getTutorialBySlug(slug)

  if (!tutorial) {
    return NextResponse.json(
      {
        message: `Unknown tutorial slug: ${slug}`,
      },
      { status: 404 },
    )
  }

  const payload = await buildTutorialPayload(tutorial)

  return NextResponse.json(payload)
}
