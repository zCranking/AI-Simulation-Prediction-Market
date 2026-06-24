'use client'

import { useMemo, useState, useEffect } from 'react'
import { createClient } from '../lib/supabase/client'
import type { Candidate, PollQuestion, PollVote } from '../lib/types'

interface Props {
  initialQuestions: PollQuestion[]
  initialVotes: PollVote[]
  candidates: Candidate[]
  userId: string
  hideForm?: boolean
}

export default function CommunityQuestions({
  initialQuestions,
  initialVotes,
  candidates,
  userId,
  hideForm = false,
}: Props) {
  const supabase = createClient()
  const [questions, setQuestions] = useState(initialQuestions)
  const [votes, setVotes] = useState(initialVotes)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [newQuestion, setNewQuestion] = useState('')
  const [newPosition, setNewPosition] = useState('')
  const [creating, setCreating] = useState(false)

  // Set up real-time subscriptions
  useEffect(() => {
    const questionsSubscription = supabase
      .channel('poll_questions_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'poll_questions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setQuestions((prev) => [payload.new as PollQuestion, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setQuestions((prev) =>
              prev.map((q) => (q.id === payload.new.id ? (payload.new as PollQuestion) : q))
            )
          } else if (payload.eventType === 'DELETE') {
            setQuestions((prev) => prev.filter((q) => q.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    const votesSubscription = supabase
      .channel('poll_votes_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'poll_votes',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setVotes((prev) => [payload.new as PollVote, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setVotes((prev) =>
              prev.map((v) => (v.id === payload.new.id ? (payload.new as PollVote) : v))
            )
          } else if (payload.eventType === 'DELETE') {
            setVotes((prev) => prev.filter((v) => v.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      questionsSubscription.unsubscribe()
      votesSubscription.unsubscribe()
    }
  }, [supabase])

  const positions = useMemo(
    () => [...new Set(candidates.map((c) => c.position).filter(Boolean))],
    [candidates]
  )

  const candidatesByPosition = useMemo(() => {
    const out: Record<string, Candidate[]> = {}
    for (const pos of positions) {
      out[pos] = candidates.filter((c) => c.position === pos)
    }
    out['ALL'] = candidates
    return out
  }, [candidates, positions])

  const myVotes = useMemo(() => {
    const map: Record<string, string> = {}
    for (const v of votes) {
      if (v.user_id === userId) map[v.question_id] = v.candidate_id
    }
    return map
  }, [votes, userId])

  function voteCount(questionId: string, candidateId: string) {
    return votes.filter((v) => v.question_id === questionId && v.candidate_id === candidateId).length
  }

  async function handleVote(questionId: string, candidateId: string) {
    setError('')
    setSubmittingId(questionId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('poll_votes') as any).upsert(
      {
        question_id: questionId,
        user_id: userId,
        candidate_id: candidateId,
      },
      { onConflict: 'question_id,user_id' }
    )

    if (error) {
      setError(error.message)
      setSubmittingId(null)
      return
    }

    setVotes((prev) => {
      const withoutMine = prev.filter((v) => !(v.question_id === questionId && v.user_id === userId))
      return [
        ...withoutMine,
        {
          id: crypto.randomUUID(),
          question_id: questionId,
          user_id: userId,
          candidate_id: candidateId,
          created_at: new Date().toISOString(),
        },
      ]
    })

    setSubmittingId(null)
  }

  async function handleCreateQuestion(e: React.FormEvent) {
    e.preventDefault()
    if (!newQuestion.trim()) return
    setCreating(true)
    setError('')

    const { data, error } = await (supabase
      .from('poll_questions') as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .insert({
        title: newQuestion.trim(),
        position: newPosition,
        status: 'active',
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      setCreating(false)
      return
    }

    setQuestions((prev) => [data as PollQuestion, ...prev])
    setNewQuestion('')
    setNewPosition('')
    setCreating(false)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-white">Community Questions</h2>
        <span className="text-xs text-gray-500">Live voter sentiment</span>
      </div>

      {/* {!hideForm && (
        <form onSubmit={handleCreateQuestion} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
        <p className="text-sm text-gray-400">Ask a question like: "Who had the best speech?"</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            className="sm:col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Type your question..."
            maxLength={120}
            required
          />
          <select
            value={newPosition}
            onChange={(e) => setNewPosition(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Positions</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="text-sm px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
        >
          {creating ? 'Adding...' : 'Add Question'}
        </button>
      </form>
      )*/}

      {error && (
        <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {questions.map((q) => {
          const raceCandidates = q.position ? (candidatesByPosition[q.position] ?? []) : candidatesByPosition.ALL
          const totalVotes = votes.filter((v) => v.question_id === q.id).length

          return (
            <article key={q.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <div className="mb-3">
                <p className="text-white font-medium leading-snug">{q.title}</p>
                <div className="text-xs text-gray-500 mt-1">
                  {q.position ? `${q.position} • ` : ''}{totalVotes} vote{totalVotes === 1 ? '' : 's'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {raceCandidates.map((c) => {
                  const count = voteCount(q.id, c.id)
                  const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100)
                  const selected = myVotes[q.id] === c.id

                  return (
                    <button
                      key={c.id}
                      onClick={() => handleVote(q.id, c.id)}
                      disabled={submittingId === q.id}
                      className={`text-left rounded-xl border px-3 py-2 transition-colors overflow-hidden ${
                        selected
                          ? 'border-indigo-500 bg-indigo-950/40'
                          : 'border-gray-700 bg-gray-800 hover:border-indigo-600'
                      }`}
                    >
                      {c.photo && (
                        <img
                          src={c.photo}
                          alt={c.name}
                          className="w-full h-24 object-cover rounded-lg mb-2"
                        />
                      )}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm text-white truncate font-medium">{c.name}</p>
                        {c.party && (
                          <span className="shrink-0 text-[10px] text-gray-300 bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5">
                            {c.party}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{count} votes • {pct}%</p>
                    </button>
                  )
                })}
              </div>
            </article>
          )
        })}

        {questions.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-sm text-gray-400">
            No questions yet. Add one above to start community voting.
          </div>
        )}
      </div>
    </section>
  )
}
