'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase/client'
import type { Candidate, PollQuestion, PollVote } from '../../lib/types'

export default function OnboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [questions, setQuestions] = useState<PollQuestion[]>([])
  const [votes, setVotes] = useState<PollVote[]>([])
  const [hasVoted, setHasVoted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function checkUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setUserId(user.id)

        // Fetch user data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: userData } = await (supabase
          .from('users') as any)
          .select('name, setup_completed')
          .eq('id', user.id)
          .single()

        if (userData?.setup_completed) {
          router.push('/')
          return
        }
        setUserName(userData?.name || '')

        // Fetch candidates, questions, and votes
        const [candidatesRes, questionsRes, votesRes] = await Promise.all([
          supabase.from('candidates').select('*'),
          supabase.from('poll_questions').select('*').eq('status', 'active').order('created_at', { ascending: false }),
          supabase.from('poll_votes').select('*'),
        ])

        setCandidates(candidatesRes.data || [])
        setQuestions(questionsRes.data || [])
        setVotes(votesRes.data || [])
      } catch (err) {
        console.error('Error fetching onboarding data:', err)
      } finally {
        setLoading(false)
      }
    }
    checkUser()
  }, [supabase, router])

  async function handleVoteComplete() {
    // FIX: Changed from 'if (userId) return' to allow logged in users to progress
    if (!userId) return
    setSubmitting(true)

    try {
      // Mark setup as complete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase
        .from('users') as any)
        .update({ setup_completed: true })
        .eq('id', userId)

      if (!error) {
        router.push('/')
        router.refresh()
      } else {
        console.error('Failed to complete onboarding database update:', error)
        setSubmitting(false)
      }
    } catch (err) {
      console.error('Exception occurred during onboarding completion:', err)
      setSubmitting(false)
    }
  }

  // Monitor votes to enable continue button
  useEffect(() => {
    if (userId && votes.length > 0) {
      const userHasVoted = votes.some((v) => v.user_id === userId)
      setHasVoted(userHasVoted)
    } else {
      setHasVoted(false)
    }
  }, [votes, userId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-4 sm:py-6 space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Welcome, {userName}!</h1>
          <p className="text-gray-400 mt-1">Help calibrate predictions with your input</p>
        </div>
        <div className="bg-blue-950/30 border border-blue-700/50 rounded-2xl p-4">
          <p className="text-sm text-blue-200">
            <span className="font-semibold">First step:</span> Vote on at least one community question for each position below. These votes help calibrate the prediction market.
          </p>
        </div>
      </div>

      {/* Questions organized by position */}
      <div className="space-y-8">
        {['Governor', 'Lt. Governor', 'Secretary of State', 'State Treasurer'].map((position) => (
          <section key={position} className="space-y-3">
            <h2 className="text-lg font-semibold text-white">{position}</h2>
            <div className="space-y-3">
              {questions
                .filter((q) => q.position === position)
                .map((q) => {
                  const raceCandidates = candidates.filter((c) => c.position === position)
                  const totalVotes = votes.filter((v) => v.question_id === q.id).length
                  
                  return (
                    <article key={q.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                      <div className="mb-4">
                        <p className="text-white font-medium">{q.title}</p>
                        <div className="text-xs text-gray-500 mt-1">
                          {totalVotes} vote{totalVotes === 1 ? '' : 's'}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {raceCandidates.map((c) => {
                          const count = votes.filter(
                            (v) => v.question_id === q.id && v.candidate_id === c.id
                          ).length
                          const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100)
                          const selected = votes.some(
                            (v) => v.question_id === q.id && v.user_id === userId && v.candidate_id === c.id
                          )
                          
                          return (
                            <button
                              key={c.id}
                              onClick={async () => {
                                if (!userId) return
                                try {
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  const { error } = await (supabase
                                    .from('poll_votes') as any)
                                    .upsert(
                                      {
                                        question_id: q.id,
                                        user_id: userId,
                                        candidate_id: c.id,
                                      },
                                      { onConflict: 'question_id,user_id' }
                                    )
                                    
                                  if (!error) {
                                    setVotes((prev) => {
                                      const withoutMine = prev.filter(
                                        (v) => !(v.question_id === q.id && v.user_id === userId)
                                      )
                                      return [
                                        ...withoutMine,
                                        {
                                          id: crypto.randomUUID(),
                                          question_id: q.id,
                                          user_id: userId,
                                          candidate_id: c.id,
                                          created_at: new Date().toISOString(),
                                        },
                                      ]
                                    })
                                  } else {
                                    console.error('Error submitting vote:', error)
                                  }
                                } catch (err) {
                                  console.error('Network failure casting vote:', err)
                                }
                              }}
                              className={`flex flex-col items-center rounded-xl border px-2 py-3 transition-colors text-center ${
                                selected
                                  ? 'border-indigo-500 bg-indigo-950/40'
                                  : 'border-gray-700 bg-gray-800 hover:border-indigo-600'
                              }`}
                            >
                              {c.photo && (
                                <img
                                  src={c.photo}
                                  alt={c.name}
                                  className="w-12 h-12 rounded-full object-cover mb-2 border border-gray-600"
                                />
                              )}
                              <p className="text-xs text-white truncate font-medium max-w-full">
                                {c.name.split(' ')[0]}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">{count} • {pct}%</p>
                            </button>
                          )
                        })}
                      </div>
                    </article>
                  )
                })}
            </div>
          </section>
        ))}
      </div>

      <div className="flex gap-3 sticky bottom-0 py-4 bg-gradient-to-t from-gray-950 to-transparent">
        <button
          onClick={handleVoteComplete}
          disabled={!hasVoted || submitting}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {submitting ? 'Updating Profile...' : 'Continue to Market'}
        </button>
      </div>
    </div>
  )
}
