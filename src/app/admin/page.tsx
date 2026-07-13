import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import AdminPanel from './AdminPanel'
import type { Market, MarketGroup, MarketOutcome, AiForecast } from '../../lib/types'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value

  if (!process.env.ADMIN_PASSWORD || token !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login')
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [r1, r2, r3, r4] = await Promise.all([
    db.from('markets').select('*').order('created_at'),
    db.from('market_outcomes').select('*').order('sort_order'),
    db.from('market_groups').select('*').order('created_at'),
    db
      .from('ai_forecasts')
      .select('market_id, created_at, model')
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  return (
    <AdminPanel
      initialMarkets={(r1.data ?? []) as Market[]}
      initialOutcomes={(r2.data ?? []) as MarketOutcome[]}
      groups={(r3.data ?? []) as MarketGroup[]}
      recentForecasts={(r4.data ?? []) as Pick<AiForecast, 'market_id' | 'created_at' | 'model'>[]}
      aiConfigured={Boolean(process.env.VULTR_API_KEY || process.env.ANTHROPIC_API_KEY)}
    />
  )
}
