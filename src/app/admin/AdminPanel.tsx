'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Market, MarketGroup, MarketOutcome, MarketType, AiForecast } from '../../lib/types'
import {
  adminLogout,
  createMarket,
  updateMarket,
  deleteMarket,
  resolveMarket,
  voidMarket,
  addOutcome,
  deleteOutcome,
  uploadOutcomePhoto,
} from './actions'

interface Props {
  initialMarkets: Market[]
  initialOutcomes: MarketOutcome[]
  groups: MarketGroup[]
  recentForecasts: Pick<AiForecast, 'market_id' | 'created_at' | 'model'>[]
  aiConfigured: boolean
}

const statusStyles: Record<Market['status'], string> = {
  draft: 'bg-gray-800 text-gray-400 border-gray-700',
  active: 'bg-green-950 text-green-400 border-green-700',
  resolved: 'bg-indigo-950 text-indigo-300 border-indigo-700',
  voided: 'bg-red-950 text-red-400 border-red-800',
}

export default function AdminPanel({
  initialMarkets,
  initialOutcomes,
  groups,
  recentForecasts,
  aiConfigured,
}: Props) {
  const router = useRouter()
  const markets = initialMarkets
  const outcomes = initialOutcomes
  const [openMarketId, setOpenMarketId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newType, setNewType] = useState<MarketType>('binary')
  const [newWinners, setNewWinners] = useState(1)
  const [newGroupId, setNewGroupId] = useState<string>('')

  // Resolution picker: marketId -> selected winner outcome ids
  const [winnerPicks, setWinnerPicks] = useState<Record<string, string[]>>({})

  const lastForecastByMarket = useMemo(() => {
    const map = new Map<string, { created_at: string; model: string }>()
    for (const f of recentForecasts) {
      if (!map.has(f.market_id)) map.set(f.market_id, f)
    }
    return map
  }, [recentForecasts])

  function refresh() {
    router.refresh()
  }

  async function run(action: () => Promise<{ error?: string; message?: string } | void>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await action()
      if (result && 'error' in result && result.error) setError(result.error)
      else {
        if (result && 'message' in result && result.message) setNotice(result.message)
        refresh()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function triggerForecast(marketId: string, model: 'fast' | 'deep') {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/ai-analyst/run/${marketId}?model=${model}`, { method: 'POST' })
      const body = await res.json()
      if (body.success) {
        setNotice(`AI forecast saved (${model === 'deep' ? 'deep' : 'fast'})`)
        refresh()
      } else {
        setError(body.message ?? 'Forecast failed')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin — Markets</h1>
          <p className="text-gray-400 text-sm mt-1">
            Create markets, manage outcomes, trigger AI forecasts, resolve winners.
          </p>
        </div>
        <button
          onClick={async () => {
            await adminLogout()
            router.push('/admin/login')
          }}
          className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5"
        >
          Log out
        </button>
      </div>

      {!aiConfigured && (
        <div className="bg-amber-950/40 border border-amber-700 rounded-2xl p-4 text-sm text-amber-300">
          <span className="font-semibold">AI Analyst is inactive:</span> set{' '}
          <code className="bg-gray-800 px-1 rounded">VULTR_API_KEY</code> or{' '}
          <code className="bg-gray-800 px-1 rounded">ANTHROPIC_API_KEY</code> in your environment
          to enable forecasts.
        </div>
      )}
      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-2xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="bg-green-950/40 border border-green-800 rounded-2xl p-4 text-sm text-green-300">
          {notice}
        </div>
      )}

      {/* Create market */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-sm font-semibold text-white"
        >
          {showCreate ? '− Cancel' : '+ New market'}
        </button>

        {showCreate && (
          <div className="mt-4 space-y-3">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Market title (e.g. 'Will it rain at graduation?')"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description / resolution criteria — also given to the AI Analyst as context"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            />
            <div className="flex gap-3 flex-wrap items-center">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as MarketType)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="binary">Binary (Yes/No)</option>
                <option value="single_winner">Single winner (many outcomes)</option>
                <option value="multi_winner">Multi winner (top N)</option>
              </select>
              {newType === 'multi_winner' && (
                <label className="text-sm text-gray-400 flex items-center gap-2">
                  Winners:
                  <input
                    type="number"
                    min={1}
                    value={newWinners}
                    onChange={(e) => setNewWinners(parseInt(e.target.value, 10) || 1)}
                    className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm"
                  />
                </label>
              )}
              <select
                value={newGroupId}
                onChange={(e) => setNewGroupId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              {(['draft', 'active'] as const).map((status) => (
                <button
                  key={status}
                  disabled={busy || !newTitle.trim()}
                  onClick={() =>
                    run(async () => {
                      const result = await createMarket({
                        title: newTitle,
                        description: newDescription,
                        marketType: newType,
                        winnersCount: newWinners,
                        groupId: newGroupId || null,
                        status,
                      })
                      if (!result.error) {
                        setNewTitle('')
                        setNewDescription('')
                        setShowCreate(false)
                        if (result.market) setOpenMarketId(result.market.id)
                      }
                      return result
                    })
                  }
                  className={`text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 ${
                    status === 'active'
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                  }`}
                >
                  Create {status === 'active' ? '& publish' : 'as draft'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Market list */}
      <div className="space-y-3">
        {markets.map((market) => {
          const marketOutcomes = outcomes.filter((o) => o.market_id === market.id)
          const isOpen = openMarketId === market.id
          const picks = winnerPicks[market.id] ?? []
          const lastForecast = lastForecastByMarket.get(market.id)
          const canResolve = market.status === 'active' && marketOutcomes.length >= 2

          return (
            <div key={market.id} className="bg-gray-900 border border-gray-800 rounded-2xl">
              <button
                onClick={() => setOpenMarketId(isOpen ? null : market.id)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{market.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {marketOutcomes.length} outcomes · {market.market_type}
                    {market.market_type === 'multi_winner' ? ` (top ${market.winners_count})` : ''}
                    {lastForecast &&
                      ` · last AI forecast ${new Date(lastForecast.created_at).toLocaleString()}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border uppercase ${statusStyles[market.status]}`}
                >
                  {market.status}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 p-4 space-y-4">
                  {/* Market controls */}
                  <div className="flex gap-2 flex-wrap">
                    {market.status === 'draft' && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              updateMarket(market.id, {
                                title: market.title,
                                description: market.description,
                                status: 'active',
                              })
                            )
                          }
                          className="text-xs font-semibold bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          Publish
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`Delete draft "${market.title}"?`))
                              run(() => deleteMarket(market.id))
                          }}
                          className="text-xs font-semibold bg-red-900 hover:bg-red-800 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          Delete draft
                        </button>
                      </>
                    )}
                    {market.status === 'active' && (
                      <>
                        <button
                          disabled={busy || !aiConfigured}
                          onClick={() => triggerForecast(market.id, 'fast')}
                          className="text-xs font-semibold bg-purple-800 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                          title="Same model the cron uses"
                        >
                          🤖 Re-forecast now
                        </button>
                        <button
                          disabled={busy || !aiConfigured}
                          onClick={() => triggerForecast(market.id, 'deep')}
                          className="text-xs font-semibold bg-purple-950 hover:bg-purple-900 border border-purple-700 text-purple-300 px-3 py-1.5 rounded-lg disabled:opacity-50"
                          title="Slower, deeper one-off analysis (same model as fast on Vultr)"
                        >
                          🤖 Deep analysis
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Void "${market.title}"? All stakes will be refunded at face value.`
                              )
                            )
                              run(() => voidMarket(market.id))
                          }}
                          className="text-xs font-semibold bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          Void market
                        </button>
                      </>
                    )}
                  </div>

                  {/* Resolution */}
                  {canResolve && (
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-semibold text-white">
                        Resolve — pick {market.winners_count} winner
                        {market.winners_count > 1 ? 's' : ''} ({picks.length}/{market.winners_count}{' '}
                        selected)
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {marketOutcomes.map((o) => {
                          const picked = picks.includes(o.id)
                          return (
                            <button
                              key={o.id}
                              onClick={() =>
                                setWinnerPicks((prev) => {
                                  const current = prev[market.id] ?? []
                                  const next = picked
                                    ? current.filter((id) => id !== o.id)
                                    : current.length < market.winners_count
                                      ? [...current, o.id]
                                      : current
                                  return { ...prev, [market.id]: next }
                                })
                              }
                              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                picked
                                  ? 'bg-yellow-900/50 border-yellow-600 text-yellow-300'
                                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                              }`}
                            >
                              {picked ? '🏆 ' : ''}
                              {o.label}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        disabled={busy || picks.length !== market.winners_count}
                        onClick={() => {
                          if (
                            confirm(
                              `Resolve "${market.title}" with winner(s): ${marketOutcomes
                                .filter((o) => picks.includes(o.id))
                                .map((o) => o.label)
                                .join(
                                  ', '
                                )}? Winning stakes are paid out immediately. This cannot be undone.`
                            )
                          )
                            run(() => resolveMarket(market.id, picks))
                        }}
                        className="text-xs font-semibold bg-yellow-700 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                      >
                        Resolve market
                      </button>
                    </div>
                  )}

                  {/* Outcomes */}
                  <OutcomeEditor market={market} outcomes={marketOutcomes} busy={busy} run={run} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OutcomeEditor({
  market,
  outcomes,
  busy,
  run,
}: {
  market: Market
  outcomes: MarketOutcome[]
  busy: boolean
  run: (action: () => Promise<{ error?: string } | void>) => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [party, setParty] = useState('')
  const [baseProbability, setBaseProbability] = useState('')
  const editable = market.status === 'draft' || market.status === 'active'

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-white">Outcomes</p>
      <div className="space-y-2">
        {outcomes.map((o) => (
          <div
            key={o.id}
            className="flex items-center gap-3 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2"
          >
            {o.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={o.photo_url}
                alt={o.label}
                className="w-8 h-8 rounded-full object-cover bg-gray-800 shrink-0"
              />
            ) : (
              <label
                className="w-8 h-8 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs text-gray-500 cursor-pointer hover:bg-gray-700"
                title="Upload photo"
              >
                +
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const fd = new FormData()
                    fd.set('photo', file)
                    fd.set('outcomeId', o.id)
                    run(() => uploadOutcomePhoto(fd))
                  }}
                />
              </label>
            )}
            <span className="flex-1 text-sm text-white truncate">
              {o.label}
              {o.party && <span className="text-gray-500"> · {o.party}</span>}
              {o.is_winner && <span> 🏆</span>}
            </span>
            <span className="text-xs text-gray-500 tabular-nums shrink-0">
              {o.total_points} pts
              {o.base_probability > 0 && ` · prior ${o.base_probability}%`}
            </span>
            {editable && (
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete outcome "${o.label}"? Any stakes on it are removed.`))
                    run(() => deleteOutcome(o.id))
                }}
                className="text-xs text-red-400 hover:text-red-300 shrink-0 disabled:opacity-50"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {editable && market.market_type !== 'binary' && (
        <div className="flex gap-2 flex-wrap items-center pt-1">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="New outcome label"
            className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm"
          />
          <input
            value={party}
            onChange={(e) => setParty(e.target.value)}
            placeholder="Party (optional)"
            className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm"
          />
          <input
            value={baseProbability}
            onChange={(e) => setBaseProbability(e.target.value)}
            placeholder="Prior %"
            type="number"
            min={0}
            max={100}
            className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm"
          />
          <button
            disabled={busy || !label.trim()}
            onClick={() => {
              const fd = new FormData()
              fd.set('marketId', market.id)
              fd.set('label', label)
              fd.set('party', party)
              fd.set('baseProbability', baseProbability)
              run(async () => {
                const result = await addOutcome(fd)
                if (!result.error) {
                  setLabel('')
                  setParty('')
                  setBaseProbability('')
                }
                return result
              })
            }}
            className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg disabled:opacity-50"
          >
            Add outcome
          </button>
        </div>
      )}
    </div>
  )
}
