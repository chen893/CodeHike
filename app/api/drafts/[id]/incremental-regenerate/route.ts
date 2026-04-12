import { NextResponse } from 'next/server'
import { computeAffectedSteps, regenerateAffectedSteps } from '@/lib/services/incremental-regenerate'

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  try {
    const body = await req.json()
    const { oldOutline, newOutline, modelId } = body

    if (!oldOutline || !newOutline) {
      return NextResponse.json(
        { message: 'oldOutline and newOutline are required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const affectedIndices = computeAffectedSteps(oldOutline, newOutline)

    if (affectedIndices.length === 0) {
      return NextResponse.json({ affectedIndices: [], message: 'No changes detected' })
    }

    const result = await regenerateAffectedSteps(id, affectedIndices, modelId)

    return NextResponse.json({
      affectedIndices,
      regeneratedCount: result.regeneratedCount,
    })
  } catch (err: any) {
    console.error('增量重新生成失败:', err)
    return NextResponse.json(
      { message: err.message || '增量重新生成失败', code: 'GENERATION_FAILED' },
      { status: 500 }
    )
  }
}
