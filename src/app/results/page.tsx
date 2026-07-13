import Link from 'next/link'
import { createClient } from '../../lib/supabase/server'
import { computeOutcomeProbabilities, partyBadgeStyle, partyColor } from '../../lib/market'
import type {
  Market,
  MarketOutcome,
  PollQuestion,
  PollVote,
  AiForecast,
} from '../../lib/types'

export const revalidate = 30

export default async function ResultsPage() {
  const supabase = await createClient()

  const [r1, r2, r3, r4, r5] = await Promise.all([
    supabase.from('markets').select('*').neq('status', 'draft').order('created_at'),
    supabase.from('market_outcomes').select('*').order('sort_order'),
    supabase.from('poll_questions').select('*').eq('status', 'active'),
    supabase.from('poll_votes').select('*'),
    supabase.from('ai_forecasts').select('*').order('created_at', { ascending: false }).limit(500),
  ])

  const markets = (r1.data ?? []) as Market[]
  const withProb = computeOutcomeProbabilities(
    (r2.data ?? []) as MarketOutcome[],
    (r3.data ?? []) as PollQuestion[],
    (r4.data ?? []) as PollVote[],
    (r5.data ?? []) as AiForecast[]
  )

  const totalStaked = withProb.reduce((sum, o) => sum + o.total_points, 0)
  const anyLive = markets.some((m) => m.status === 'active')

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Odds</h1>
          <p className="text-gray-400 text-sm mt-1">
            {totalStaked.toLocaleString()} points staked across all markets
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            anyLive
              ? 'bg-green-950 border-green-700 text-green-400'
              : 'bg-gray-800 border-gray-700 text-gray-400'
          }`}
        >
          {anyLive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          {anyLive ? 'LIVE' : 'CLOSED'}
        </span>
      </div>

      {markets.map((market) => {
        const group = withProb
          .filter((o) => o.market_id === market.id)
          .sort((a, b) => b.probability - a.probability)
        const isResolved = market.status === 'resolved'
        const winners = group.filter((o) => o.is_winner)

        return (
          <section key={market.id}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">
                <Link href={`/markets/${market.slug}`} className="hover:text-indigo-300">
                  {market.title}
                </Link>
              </h2>
              <Link
                href={`/markets/${market.slug}`}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                View market →
              </Link>
            </div>

            {isResolved && winners.length > 0 && (
              <div className="mb-3 bg-linear-to-r from-yellow-900/40 to-amber-900/40 border border-yellow-600 rounded-xl p-4 flex items-center gap-4 flex-wrap">
                <span className="text-3xl">🏆</span>
                <div>
                  <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wider">
                    Winner{winners.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-white font-bold">
                    {winners.map((w) => w.label).join(', ')}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 space-y-4">
                {group.map((o) => (
                  <div key={o.id} className="flex items-center gap-3">
                    {o.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={o.photo_url}
                        alt={o.label}
                        className="w-8 h-8 rounded-full object-cover bg-gray-800 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs font-bold text-gray-500">
                        {o.label.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`font-medium text-sm truncate ${
                              o.is_winner && isResolved ? 'text-yellow-300' : 'text-white'
                            }`}
                          >
                            {o.label}
                            {o.is_winner && isResolved ? ' 🏆' : ''}
                          </span>
                          {o.party && (
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${partyBadgeStyle(o.party)}`}
                            >
                              {o.party}
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-2 shrink-0 tabular-nums text-sm">
                          {o.ai_probability !== null && (
                            <span className="text-xs text-purple-400" title="AI Analyst forecast">
                              🤖 {o.ai_probability.toFixed(1)}%
                            </span>
                          )}
                          <span className="font-bold text-white">{o.probability.toFixed(1)}%</span>
                        </span>
                      </div>
                      <div className="relative h-2 bg-gray-800 rounded-full mt-1.5 overflow-visible">
                        <div
                          className="absolute top-0 h-full rounded-full"
                          style={{
                            width: `${o.probability}%`,
                            backgroundColor: partyColor(o.party),
                          }}
                        />
                        {o.ai_probability !== null && (
                          <div
                            className="absolute -top-0.5 h-3 w-0.5 rounded bg-purple-400"
                            style={{ left: `${Math.min(o.ai_probability, 99.5)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )
      })}

      {anyLive && (
        <p className="text-sm text-gray-500 text-center">
          Markets in progress — odds update as stakes are placed. Purple markers show the AI
          Analyst&apos;s latest forecast.
        </p>
      )}
    </div>
  )
}
