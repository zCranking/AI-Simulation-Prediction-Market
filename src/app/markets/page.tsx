import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { computeOutcomeProbabilities } from '../../lib/market'
import type {
  Market,
  MarketGroup,
  MarketOutcome,
  PollQuestion,
  PollVote,
  AiForecast,
} from '../../lib/types'

export const revalidate = 0

const supabaseConfigured = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').startsWith('http')

function statusBadge(status: Market['status']) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-950 border border-green-700 text-green-400 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          LIVE
        </span>
      )
    case 'resolved':
      return (
        <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400 text-xs font-semibold">
          RESOLVED
        </span>
      )
    case 'voided':
      return (
        <span className="px-2 py-0.5 rounded-full bg-red-950 border border-red-800 text-red-400 text-xs font-semibold">
          VOIDED
        </span>
      )
    default:
      return null
  }
}

export default async function MarketsPage() {
  if (!supabaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h2 className="text-2xl font-bold text-white mb-3">Setup Required</h2>
        <p className="text-gray-400 mb-4 max-w-md">
          Add your Supabase credentials to{' '}
          <code className="text-indigo-400 bg-gray-800 px-1.5 py-0.5 rounded">.env.local</code> —
          see <code className="text-indigo-400 bg-gray-800 px-1.5 py-0.5 rounded">.env.example</code>{' '}
          for the required variables.
        </p>
      </div>
    )
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
    supabase.from('market_groups').select('*').order('created_at'),
    supabase.from('markets').select('*').neq('status', 'draft').order('created_at'),
    supabase.from('market_outcomes').select('*').order('sort_order'),
    supabase.from('poll_questions').select('*').eq('status', 'active'),
    supabase.from('poll_votes').select('*'),
    supabase.from('ai_forecasts').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('users').select('setup_completed').eq('id', authUser.id).single(),
  ])

  if (!r7.data?.setup_completed) redirect('/onboard')

  const groups = (r1.data ?? []) as MarketGroup[]
  const markets = (r2.data ?? []) as Market[]
  const outcomes = (r3.data ?? []) as MarketOutcome[]
  const withProb = computeOutcomeProbabilities(
    outcomes,
    (r4.data ?? []) as PollQuestion[],
    (r5.data ?? []) as PollVote[],
    (r6.data ?? []) as AiForecast[]
  )

  const grouped = groups
    .map((g) => ({ group: g, markets: markets.filter((m) => m.group_id === g.id) }))
    .filter((g) => g.markets.length > 0)
  const standalone = markets.filter((m) => !m.group_id)

  function marketCard(market: Market) {
    const top = withProb
      .filter((o) => o.market_id === market.id)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3)

    return (
      <Link
        key={market.id}
        href={`/markets/${market.slug}`}
        className="group bg-gray-900 border border-gray-800 hover:border-indigo-600 rounded-2xl p-5 transition-all flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-white group-hover:text-indigo-300 leading-snug">
            {market.title}
          </h3>
          {statusBadge(market.status)}
        </div>

        <div className="space-y-2 flex-1">
          {top.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-300 truncate">
                {o.label}
                {o.is_winner && market.status === 'resolved' ? ' 🏆' : ''}
              </span>
              <span className="flex items-center gap-2 shrink-0 tabular-nums">
                <span className="text-white font-semibold">{o.probability.toFixed(0)}%</span>
                {o.ai_probability !== null && (
                  <span className="text-xs text-purple-400" title="AI Analyst forecast">
                    AI {o.ai_probability.toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {market.market_type === 'multi_winner' && (
          <span className="text-xs text-indigo-400">Top {market.winners_count} win</span>
        )}
      </Link>
    )
  }

  return (
    <div className="py-6 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Markets</h1>
        <p className="text-gray-400 text-sm mt-1">
          Stake points on outcomes. The crowd sets the odds — the AI Analyst makes its own call.
        </p>
      </div>

      {grouped.map(({ group, markets: groupMarkets }) => (
        <section key={group.id} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{group.title}</h2>
            {group.description && (
              <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groupMarkets.map(marketCard)}
          </div>
        </section>
      ))}

      {standalone.length > 0 && (
        <section className="space-y-4">
          {grouped.length > 0 && <h2 className="text-lg font-semibold text-white">More markets</h2>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {standalone.map(marketCard)}
          </div>
        </section>
      )}

      {markets.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          No markets yet. Check back soon.
        </div>
      )}
    </div>
  )
}
