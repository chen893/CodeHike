import { NextResponse } from 'next/server'
import { probeModelCapabilities } from '@/lib/ai/model-probe'

export async function POST(req: Request) {
  try {
    const { modelId } = await req.json()
    if (!modelId || typeof modelId !== 'string') {
      return NextResponse.json(
        { message: 'modelId is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const result = await probeModelCapabilities(modelId)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { message: err.message || 'Probe failed', code: 'GENERATION_FAILED' },
      { status: 500 }
    )
  }
}
