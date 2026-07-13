import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { forecastMarket, type AiModelKey } from '../../../../../lib/ai'

export const maxDuration = 60

// Admin-only manual trigger: POST /api/ai-analyst/run/:marketId?model=deep
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (!process.env.ADMIN_PASSWORD || token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { marketId } = await params
  const modelKey: AiModelKey =
    request.nextUrl.searchParams.get('model') === 'deep' ? 'deep' : 'fast'

  const result = await forecastMarket(marketId, modelKey)
  return NextResponse.json(result, { status: result.success ? 200 : 422 })
}
