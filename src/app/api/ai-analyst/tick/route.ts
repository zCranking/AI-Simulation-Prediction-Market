import { NextResponse, type NextRequest } from 'next/server'
import { forecastAllActiveMarkets } from '../../../../lib/ai'

export const maxDuration = 300

// Vercel Cron entrypoint: re-forecasts every active market.
// Protected by CRON_SECRET (Vercel sends it as a Bearer token automatically
// when the env var is set on the project).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const result = await forecastAllActiveMarkets()
  return NextResponse.json({ success: true, ...result })
}
