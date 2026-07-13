'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '../../lib/supabase/client'
import type { Market, MarketOutcome, PollQuestion, PollVote } from '../../lib/types'

export default function OnboardPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [markets, setMarkets] = useState<Market[]>([])
  const [outcomes, setOutcomes] = useState<MarketOutcome[]>([])
  const [questions, setQuestions] = useState<PollQuestion[]>([])
  const [votes, setVotes] = useState<PollVote[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setUserId(user.id)

        const { data: userData } = await supabase
          .from('users')
          .select('name, setup_completed')
          .eq('id', user.id)
          .single()

        if (userData?.setup_completed) {
          router.push('/markets')
          return
        }
        setUserName(userData?.name || '')

        const [marketsRes, outcomesRes, questionsRes, votesRes] = await Promise.all([
          supabase.from('markets').select('*').eq('status', 'active'),
          supabase.from('market_outcomes').select('*').order('sort_order'),
          supabase
            .from('poll_questions')
            .select('*')
            .eq('status', 'active')
            .not('market_id', 'is', null)
            .order('created_at', { ascending: false }),
          supabase.from('poll_votes').select('*'),
        ])

        setMarkets((marketsRes.data ?? []) as Market[])
        setOutcomes(outcomesRes.data ?? [])
        setQuestions(questionsRes.data ?? [])
        setVotes(votesRes.data ?? [])
      } catch (err) {
        console.error('Error fetching onboarding data:', err)
        setError('Could not load onboarding — please refresh.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase, router])

  // Markets that actually have active questions, in creation order
  const marketsWithQuestions = useMemo(
    () => markets.filter((m) => questions.some((q) => q.market_id === m.id)),
    [markets, questions]
  )

  async function castVote(question: PollQuestion, outcome: MarketOutcome) {
    if (!userId) return
    setError(null)
    const { error: voteError } = await supabase.from('poll_votes').upsert(
      {
        question_id: question.id,
        user_id: userId,
        outcome_id: outcome.id,
      },
      { onConflict: 'question_id,user_id' }
    )
    if (voteError) {
      console.error('Error submitting vote:', voteError)
      setError(`Could not save your vote: ${voteError.message}`)
      return
    }
    setVotes((prev) => {
      const withoutMine = prev.filter(
        (v) => !(v.question_id === question.id && v.user_id === userId)
      )
      return [
        ...withoutMine,
        {
          id: crypto.randomUUID(),
          question_id: question.id,
          user_id: userId,
          candidate_id: '',
          outcome_id: outcome.id,
          created_at: new Date().toISOString(),
        },
      ]
    })
  }

  async function handleComplete() {
    if (!userId) return
    setSubmitting(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('users')
      .update({ setup_completed: true })
      .eq('id', userId)

    if (!updateError) {
      router.push('/markets')
      router.refresh()
    } else {
      console.error('Failed to complete onboarding:', updateError)
      setError(`Could not finish setup: ${updateError.message}`)
      setSubmitting(false)
    }
  }

  const hasVoted = Boolean(userId) && votes.some((v) => v.user_id === userId)
  const noQuestions = !loading && marketsWithQuestions.length === 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="py-4 sm:py-6 space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Welcome, {userName}!</h1>
          <p className="text-gray-400 mt-1">Help calibrate the markets with your input</p>
        </div>
        {!noQuestions && (
          <div className="bg-blue-950/30 border border-blue-700/50 rounded-2xl p-4">
            <p className="text-sm text-blue-200">
              <span className="font-semibold">First step:</span> vote on at least one community
              question below. These votes feed into the market odds.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-2xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {marketsWithQuestions.map((market) => {
          const marketOutcomes = outcomes.filter((o) => o.market_id === market.id)
          return (
            <section key={market.id} className="space-y-3">
              <h2 className="text-lg font-semibold text-white">{market.title}</h2>
              <div className="space-y-3">
                {questions
                  .filter((q) => q.market_id === market.id)
                  .map((q) => {
                    const totalVotes = votes.filter((v) => v.question_id === q.id).length
                    return (
                      <article
                        key={q.id}
                        className="bg-gray-900 border border-gray-800 rounded-2xl p-4"
                      >
                        <div className="mb-4">
                          <p className="text-white font-medium">{q.title}</p>
                          <div className="text-xs text-gray-500 mt-1">
                            {totalVotes} vote{totalVotes === 1 ? '' : 's'}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {marketOutcomes.map((o) => {
                            const count = votes.filter(
                              (v) => v.question_id === q.id && v.outcome_id === o.id
                            ).length
                            const pct =
                              totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100)
                            const selected = votes.some(
                              (v) =>
                                v.question_id === q.id &&
                                v.user_id === userId &&
                                v.outcome_id === o.id
                            )

                            return (
                              <button
                                key={o.id}
                                onClick={() => castVote(q, o)}
                                className={`flex flex-col items-center rounded-xl border px-2 py-3 transition-colors text-center ${
                                  selected
                                    ? 'border-indigo-500 bg-indigo-950/40'
                                    : 'border-gray-700 bg-gray-800 hover:border-indigo-600'
                                }`}
                              >
                                {o.photo_url && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={o.photo_url}
                                    alt={o.label}
                                    className="w-12 h-12 rounded-full object-cover mb-2 border border-gray-600"
                                  />
                                )}
                                <p className="text-xs text-white truncate font-medium max-w-full">
                                  {o.label.split(' ')[0]}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {count} • {pct}%
                                </p>
                              </button>
                            )
                          })}
                        </div>
                      </article>
                    )
                  })}
              </div>
            </section>
          )
        })}
      </div>

      {noQuestions && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-gray-400">
          No community questions are open right now — head straight to the markets.
        </div>
      )}

      <div className="flex gap-3 sticky bottom-0 py-4 bg-gradient-to-t from-gray-950 to-transparent">
        <button
          onClick={handleComplete}
          disabled={(!hasVoted && !noQuestions) || submitting}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {submitting ? 'Saving…' : 'Continue to Markets'}
        </button>
      </div>
    </div>
  )
}
