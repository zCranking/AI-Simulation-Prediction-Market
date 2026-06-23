import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase/server'
import { computeProbabilities } from '../../../lib/market'
import ProbabilityBar from '../../../components/ProbabilityBar'
import BetForm from '../../../components/BetForm'
import type { Candidate, Prediction, ElectionSettings } from '../../../lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CandidatePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect('/login')
  }

  const [r1, r2, r3, r4, r5] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', id).single(),
    supabase.from('candidates').select('*').order('created_at'),
    supabase.from('predictions').select('candidate_id, points_allocated'),
    supabase.from('election_settings').select('*').eq('id', 1).single(),
    supabase
      .from('predictions')
      .select('candidate_id, points_allocated, created_at')
      .eq('user_id', authUser.id),
  ])
  const candidate = r1.data as Candidate | null
  const candidates = r2.data as Candidate[] | null
  const predictions = r3.data as Pick<Prediction, 'candidate_id' | 'points_allocated'>[] | null
  const electionSettings = r4.data as ElectionSettings | null
  const userPredictions = r5.data as Pick<Prediction, 'candidate_id' | 'points_allocated' | 'created_at'>[] | null

  if (!candidate) notFound()

  const withProb = computeProbabilities(candidates ?? [], predictions ?? [])
  const thisCandidate = withProb.find((c) => c.id === id)
  const probability = thisCandidate?.probability ?? 50
  const totalPoints = thisCandidate?.total_points ?? 0

  const myPredictionsForThis = (userPredictions ?? []).filter((p) => p.candidate_id === id)
  const myPointsOnThis = myPredictionsForThis.reduce((sum, p) => sum + p.points_allocated, 0)

  const partyColors: Record<string, string> = {
    whig: 'bg-amber-600',
    federalist: 'bg-blue-600',
    nonpartisan: 'bg-gray-600',
  }
  const partyKey = Object.keys(partyColors).find((k) =>
    candidate.party.toLowerCase().includes(k)
  )
  const partyBadge = partyColors[partyKey ?? ''] ?? 'bg-gray-600'

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      {/* Candidate hero */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="h-24 bg-linear-to-r from-indigo-900 to-purple-900" />
        <div className="px-6 pb-6">
          <div className="-mt-12 flex items-end gap-4 mb-4">
            <img
              src={candidate.photo}
              alt={candidate.name}
              className="w-24 h-24 rounded-full border-4 border-gray-900 object-cover bg-gray-800"
            />
            <div className="pb-2">
              <h1 className="text-2xl font-bold text-white">{candidate.name}</h1>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white ${partyBadge}`}
              >
                {candidate.party}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <ProbabilityBar probability={probability} party={candidate.party} />
            <div className="flex gap-4 text-sm text-gray-400">
              <span>
                Predictions placed:{' '}
                <span className="text-white font-medium">{totalPoints.toLocaleString()}</span>
              </span>
              {myPointsOnThis > 0 && (
                <span>
                  Your predictions:{' '}
                  <span className="text-indigo-400 font-medium">
                    {myPointsOnThis.toLocaleString()}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bet form */}
      <BetForm
        candidateId={candidate.id}
        candidateName={candidate.name}
        electionStatus={electionSettings?.status ?? 'active'}
      />

      {/* Your predictions on this candidate */}
      {myPredictionsForThis.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Your Predictions
          </h3>
          <ul className="divide-y divide-gray-800">
            {myPredictionsForThis.map((p, i) => (
              <li key={i} className="py-2.5 flex justify-between text-sm">
                <span className="text-gray-400">
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
                <span className="text-white font-medium">
                  {p.points_allocated.toLocaleString()} prediction
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
