import { redirect } from 'next/navigation'
import { createClient } from '../lib/supabase/server'
import RealtimeMarket from '../components/RealtimeMarket'
import CommunityQuestions from '../components/CommunityQuestions'
import type { Candidate, Prediction, ElectionSettings, PollQuestion, PollVote } from '../lib/types'

const supabaseConfigured =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').startsWith('http')

export default async function MarketPage() {
  if (!supabaseConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h2 className="text-2xl font-bold text-white mb-3">Setup Required</h2>
        <p className="text-gray-400 mb-4 max-w-md">
          Add your Supabase credentials to{' '}
          <code className="text-indigo-400 bg-gray-800 px-1.5 py-0.5 rounded">.env.local</code>{' '}
          to start using Election Predic.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-left text-sm font-mono text-gray-300 max-w-md w-full">
          <p>NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co</p>
          <p>NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...</p>
          <p>SUPABASE_SERVICE_ROLE_KEY=eyJ...</p>
        </div>
        <p className="text-gray-500 text-sm mt-4">
          Get these from{' '}
          <a href="https://supabase.com" className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">supabase.com</a>{' '}
          → your project → Settings → API
        </p>
      </div>
    )
  }
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  const [r1, r2, r3, r4, r5, r6] = await Promise.all([
    supabase.from('candidates').select('*').order('created_at'),
    supabase.from('predictions').select('candidate_id, points_allocated'),
    supabase.from('election_settings').select('*').eq('id', 1).single(),
    supabase.from('poll_questions').select('*').eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('poll_votes').select('*'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('users') as any).select('setup_completed').eq('id', authUser.id).single(),
  ])
  const candidates = r1.data as Candidate[] | null
  const predictions = r2.data as Pick<Prediction, 'candidate_id' | 'points_allocated'>[] | null
  const electionSettings = r3.data as ElectionSettings | null
  const questions = r4.data as PollQuestion[] | null
  const pollVotes = r5.data as PollVote[] | null
  const userSetup = r6.data as { setup_completed: boolean } | null

  // Redirect to onboard if setup not complete
  if (!userSetup?.setup_completed) {
    redirect('/onboard')
  }

  return (
    <div className="py-4 sm:py-6 space-y-6">
      <CommunityQuestions
        initialQuestions={questions ?? []}
        initialVotes={pollVotes ?? []}
        candidates={candidates ?? []}
        userId={authUser.id}
      />

      <RealtimeMarket
        initialCandidates={candidates ?? []}
        initialPredictions={predictions ?? []}
        electionStatus={electionSettings?.status ?? 'active'}
      />
    </div>
  )
}

