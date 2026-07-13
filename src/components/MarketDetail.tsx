'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { createClient } from '../lib/supabase/client'
import {
  computeOutcomeProbabilities,
  partyBadgeStyle,
  partyColor,
  payoutMultiplier,
} from '../lib/market'
import type {
  Market,
  MarketOutcome,
  PollQuestion,
  PollVote,
  AiForecast,
  Stake,
  StakeResult,
} from '../lib/types'

interface Props {
  market: Market
  initialOutcomes: MarketOutcome[]
  pollQuestions: PollQuestion[]
  pollVotes: PollVote[]
  initialForecasts: AiForecast[]
  initialBalance: number
  initialMyStakes: Stake[]
  userId: string
}

const CHART_COLORS = ['#818cf8', '#f59e0b', '#34d399', '#f472b6', '#38bdf8', '#a78bfa', '#fb923c']

export default function MarketDetail({
  market: initialMarket,
  initialOutcomes,
  pollQuestions,
  pollVotes,
  initialForecasts,
  initialBalance,
  initialMyStakes,
  userId,
}: Props) {
  const supabase = useMemo(() => createClient(), [])

  const [market, setMarket] = useState(initialMarket)
  const [outcomes, setOutcomes] = useState(initialOutcomes)
  const [forecasts, setForecasts] = useState(initialForecasts)
  const [balance, setBalance] = useState(initialBalance)
  const [myStakes, setMyStakes] = useState(initialMyStakes)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [placing, setPlacing] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [expandedRationale, setExpandedRationale] = useState<string | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel(`market-${market.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'market_outcomes', filter: `market_id=eq.${market.id}` },
        (payload) =>
          setOutcomes((prev) =>
            prev.map((o) => (o.id === payload.new.id ? (payload.new as MarketOutcome) : o))
          )
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_forecasts', filter: `market_id=eq.${market.id}` },
        (payload) => setForecasts((prev) => [...prev, payload.new as AiForecast])
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markets', filter: `id=eq.${market.id}` },
        (payload) => setMarket(payload.new as Market)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        (payload) => setBalance((payload.new as { points_remaining: number }).points_remaining)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, market.id, userId])

  const withProb = useMemo(
    () =>
      computeOutcomeProbabilities(outcomes, pollQuestions, pollVotes, forecasts).sort(
        (a, b) => b.probability - a.probability
      ),
    [outcomes, pollQuestions, pollVotes, forecasts]
  )

  const isActive = market.status === 'active'
  const selected = withProb.find((o) => o.id === selectedId) ?? null
  const parsedAmount = parseInt(amount, 10)
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= balance

  async function placeStake() {
    if (!selected || !validAmount || placing) return
    setPlacing(true)
    setFeedback(null)

    const { data, error } = await supabase.rpc('place_stake', {
      p_outcome_id: selected.id,
      p_points: parsedAmount,
    })
    const result = data as StakeResult | null

    if (error) {
      setFeedback({ ok: false, text: error.message })
    } else if (!result?.success) {
      setFeedback({ ok: false, text: result?.message ?? 'Something went wrong' })
    } else {
      setFeedback({ ok: true, text: `Staked ${parsedAmount} pts on ${selected.label}` })
      if (typeof result.balance_remaining === 'number') setBalance(result.balance_remaining)
      setMyStakes((prev) => [
        {
          id: crypto.randomUUID(),
          user_id: userId,
          market_id: market.id,
          outcome_id: selected.id,
          points_staked: parsedAmount,
          probability_at_stake: result.probability_at_stake ?? selected.probability,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ])
      setAmount('')
    }
    setPlacing(false)
  }

  // AI forecast history → one chart series per outcome (top 5 by probability)
  const chartData = useMemo(() => {
    if (forecasts.length === 0) return { points: [], labels: [] as string[] }
    const topIds = withProb.slice(0, 5).map((o) => o.id)
    const labelById = new Map(outcomes.map((o) => [o.id, o.label]))
    const byRun = new Map<string, Record<string, number | string>>()
    for (const f of forecasts) {
      if (!topIds.includes(f.outcome_id)) continue
      const key = f.created_at.slice(0, 16) // minute resolution groups one run together
      const point = byRun.get(key) ?? {
        time: new Date(f.created_at).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      }
      const label = labelById.get(f.outcome_id)
      if (label) point[label] = f.probability
      byRun.set(key, point)
    }
    return {
      points: [...byRun.values()],
      labels: topIds.map((id) => labelById.get(id)!).filter(Boolean),
    }
  }, [forecasts, withProb, outcomes])

  const latestForecastAt = forecasts.length
    ? new Date(forecasts[forecasts.length - 1].created_at).toLocaleString()
    : null

  const labelById = useMemo(() => new Map(outcomes.map((o) => [o.id, o.label])), [outcomes])

  return (
    <div className="py-6 space-y-6">
      <div>
        <Link href="/markets" className="text-sm text-gray-500 hover:text-gray-300">
          ← All markets
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-white">{market.title}</h1>
            {market.description && (
              <p className="text-gray-400 text-sm mt-1 max-w-2xl">{market.description}</p>
            )}
          </div>
          <div className="shrink-0">
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-950 border border-green-700 text-green-400 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-400 text-xs font-semibold uppercase">
                {market.status}
              </span>
            )}
          </div>
        </div>
        {market.market_type === 'multi_winner' && (
          <span className="inline-block mt-2 text-xs text-indigo-400 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded-full">
            Top {market.winners_count} outcomes win
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Outcome list */}
        <div className="lg:col-span-2 space-y-3">
          {withProb.map((o) => {
            const isSelected = selectedId === o.id
            const showRationale = expandedRationale === o.id
            return (
              <div
                key={o.id}
                className={`bg-gray-900 border rounded-2xl p-4 transition-colors ${
                  isSelected ? 'border-indigo-500' : 'border-gray-800'
                } ${isActive ? 'cursor-pointer hover:border-indigo-600' : ''}`}
                onClick={() => isActive && setSelectedId(isSelected ? null : o.id)}
              >
                <div className="flex items-center gap-3">
                  {o.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={o.photo_url}
                      alt={o.label}
                      className="w-10 h-10 rounded-full object-cover bg-gray-800 border border-gray-700 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-600 font-bold shrink-0">
                      {o.label.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm truncate">
                        {o.label}
                        {o.is_winner && market.status === 'resolved' ? ' 🏆' : ''}
                      </span>
                      {o.party && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${partyBadgeStyle(o.party)}`}
                        >
                          {o.party}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {o.total_points.toLocaleString()} pts staked
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-white tabular-nums">
                      {o.probability.toFixed(1)}%
                    </p>
                    {o.ai_probability !== null && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedRationale(showRationale ? null : o.id)
                        }}
                        className="text-xs text-purple-400 hover:text-purple-300 tabular-nums"
                        title="AI Analyst forecast — click for rationale"
                      >
                        🤖 AI: {o.ai_probability.toFixed(1)}%
                      </button>
                    )}
                  </div>
                </div>

                {/* Crowd bar with AI marker */}
                <div className="relative h-2.5 bg-gray-800 rounded-full mt-3 overflow-visible">
                  <div
                    className="absolute top-0 h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${o.probability}%`, backgroundColor: partyColor(o.party) }}
                  />
                  {o.ai_probability !== null && (
                    <div
                      className="absolute -top-0.5 h-3.5 w-1 rounded bg-purple-400 shadow"
                      style={{ left: `calc(${Math.min(o.ai_probability, 99.5)}% - 2px)` }}
                      title={`AI Analyst: ${o.ai_probability.toFixed(1)}%`}
                    />
                  )}
                </div>

                {showRationale && o.ai_rationale && (
                  <div className="mt-3 bg-purple-950/30 border border-purple-800/50 rounded-xl p-3 text-sm text-purple-200">
                    <span className="font-semibold">AI Analyst:</span> {o.ai_rationale}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Stake panel + my positions */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 lg:sticky lg:top-20">
            <h2 className="font-semibold text-white mb-1">Place a stake</h2>
            <p className="text-xs text-gray-500 mb-4">
              Balance: <span className="text-white font-semibold">{balance.toLocaleString()} pts</span>
            </p>

            {!isActive ? (
              <p className="text-sm text-gray-500">This market is closed for staking.</p>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-gray-300">
                  {selected ? (
                    <>
                      On: <span className="text-white font-semibold">{selected.label}</span>{' '}
                      <span className="text-gray-500">({selected.probability.toFixed(1)}%)</span>
                    </>
                  ) : (
                    <span className="text-gray-500">Select an outcome on the left</span>
                  )}
                </div>

                <input
                  type="number"
                  min={1}
                  max={balance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Points to stake"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />

                <div className="flex gap-2">
                  {[10, 50, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(String(Math.min(v, balance)))}
                      className="flex-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg py-1.5 text-gray-300 transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>

                {selected && validAmount && (
                  <p className="text-xs text-gray-500">
                    Pays{' '}
                    <span className="text-green-400 font-semibold">
                      ~{Math.floor(parsedAmount * payoutMultiplier(selected.probability)).toLocaleString()} pts
                    </span>{' '}
                    if {selected.label} wins ({payoutMultiplier(selected.probability)}x)
                  </p>
                )}

                <button
                  onClick={placeStake}
                  disabled={!selected || !validAmount || placing}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                >
                  {placing ? 'Placing…' : 'Place stake'}
                </button>

                {feedback && (
                  <p className={`text-xs ${feedback.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {feedback.text}
                  </p>
                )}
              </div>
            )}
          </div>

          {myStakes.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="font-semibold text-white mb-3 text-sm">Your positions</h2>
              <ul className="space-y-2">
                {myStakes.map((s) => (
                  <li key={s.id} className="flex justify-between text-xs text-gray-400">
                    <span className="truncate">{labelById.get(s.outcome_id) ?? '—'}</span>
                    <span className="tabular-nums shrink-0">
                      {s.points_staked} pts @ {s.probability_at_stake.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* AI forecast history */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-white">🤖 AI Analyst forecast history</h2>
          {latestForecastAt && (
            <span className="text-xs text-gray-500">Last forecast: {latestForecastAt}</span>
          )}
        </div>
        {chartData.points.length >= 2 ? (
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.points}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {chartData.labels.map((label, i) => (
                  <Line
                    key={label}
                    type="monotone"
                    dataKey={label}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500 mt-2">
            {forecasts.length === 0
              ? 'The AI Analyst has not forecast this market yet.'
              : 'The chart appears once the AI Analyst has made at least two forecasts.'}
          </p>
        )}
      </div>
    </div>
  )
}
