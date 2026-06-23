'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '../../lib/supabase/client'
import CommunityQuestions from '../../components/CommunityQuestions'
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

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

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

      // Fetch candidates and questions
      const [candidatesRes, questionsRes, votesRes] = await Promise.all([
        supabase.from('candidates').select('*'),
        supabase.from('poll_questions').select('*').eq('status', 'active').order('created_at', { ascending: false }),
        supabase.from('poll_votes').select('*'),
      ])

      setCandidates(candidatesRes.data || [])
      setQuestions(questionsRes.data || [])
      setVotes(votesRes.data || [])
      setLoading(false)
    }

    checkUser()
  }, [supabase, router])

  async function handleVoteComplete() {
    if (!userId) return

    // Mark setup as complete
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase
      .from('users') as any)
      .update({ setup_completed: true })
      .eq('id', userId)

    if (!error) {
      router.push('/')
      router.refresh()
    }
  }

  // Monitor votes to enable continue button
  useEffect(() => {
    if (userId && votes.length > 0) {
      const userHasVoted = votes.some((v) => v.user_id === userId)
      setHasVoted(userHasVoted)
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
          <p className="text-gray-400 mt-1">Let's start with your predictions</p>
        </div>
        <div className="bg-blue-950/30 border border-blue-700/50 rounded-2xl p-4">
          <p className="text-sm text-blue-200">
            <span className="font-semibold">First step:</span> Vote on community questions below to help calibrate your predictions. You need at least one vote to continue.
          </p>
        </div>
      </div>

      <CommunityQuestions
        initialQuestions={questions}
        initialVotes={votes}
        candidates={candidates}
        userId={userId || ''}
      />

      <div className="flex gap-3 sticky bottom-0 py-4 bg-gradient-to-t from-gray-950 to-transparent">
        <button
          onClick={handleVoteComplete}
          disabled={!hasVoted}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          Continue to Market
        </button>
      </div>
    </div>
  )
}
