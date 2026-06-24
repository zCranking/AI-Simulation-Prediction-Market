import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { computeProbabilities } from '../../lib/market'
import type { Candidate, Prediction, ElectionSettings } from '../../lib/types'
import ProbabilityBar from '../../components/ProbabilityBar'


export const revalidate = 30

function partyColor(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return '#f59e0b'
  if (p.includes('federalist')) return '#3b82f6'
  return '#6366f1'
}

function partyBadge(party: string) {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'bg-amber-900/50 text-amber-300 border border-amber-700'
  if (p.includes('federalist')) return 'bg-blue-900/50 text-blue-300 border border-blue-700'
  return 'bg-gray-800 text-gray-400 border border-gray-700'
}

const POSITION_ORDER = [
  'Governor', 'Lt. Governor', 'Attorney General', 'Secretary of State',
  'Controller', 'State Treasurer', 'Insurance Commissioner',
  'Superintendent of Public Instruction', 'Supreme Court Justice',
]

export default async function ResultsPage() {
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const [r1, r2, r3] = await Promise.all([
    supabase.from('candidates').select('*').order('created_at'),
    supabase.from('predictions').select('candidate_id, points_allocated'),
    supabase.from('election_settings').select('*').eq('id', 1).single(),
  ])
  const candidates = r1.data as Candidate[] | null
  const predictions = r2.data as Pick<Prediction, 'candidate_id' | 'points_allocated'>[] | null
  const electionSettings = r3.data as ElectionSettings | null

  const isResolved = electionSettings?.status === 'resolved'
  const winnerCandidateId = electionSettings?.winner_candidate_id
  const totalPoints = (predictions ?? []).reduce((sum, p) => sum + p.points_allocated, 0)

  const withProb = computeProbabilities(candidates ?? [], predictions ?? [])

  // Group by position in ballot order
  const allPositions = [...new Set((candidates ?? []).map((c) => c.position).filter(Boolean))]
  const orderedPositions = POSITION_ORDER.filter((p) => allPositions.includes(p))
    .concat(allPositions.filter((p) => !POSITION_ORDER.includes(p)))

  const byPosition: Record<string, typeof withProb> = {}
  for (const pos of orderedPositions) {
    byPosition[pos] = withProb
      .filter((c) => c.position === pos)
      .sort((a, b) => b.probability - a.probability)
  }

  return (
    <div className="py-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isResolved ? 'Election Results' : 'Live Market Odds'}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {totalPoints.toLocaleString()} predictions submitted across all races
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
          isResolved
            ? 'bg-gray-800 border-gray-700 text-gray-400'
            : 'bg-green-950 border-green-700 text-green-400'
        }`}>
          {!isResolved && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          {isResolved ? 'CLOSED' : 'LIVE'}
        </span>
      </div>

      {orderedPositions.map((pos) => {
        const group = byPosition[pos] ?? []
        const winner = isResolved ? group.find((c) => c.id === winnerCandidateId) : null

        return (
          <section key={pos}>
            <h2 className="text-lg font-semibold text-white mb-3">{pos}</h2>

            {winner && (
              <div className="mb-3 bg-linear-to-r from-yellow-900/40 to-amber-900/40 border border-yellow-600 rounded-xl p-4 flex items-center gap-4">
                {winner.photo ? (
                  <img src={winner.photo} alt={winner.name} className="w-12 h-12 rounded-full object-cover border-2 border-yellow-500" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-yellow-500 flex items-center justify-center text-lg font-bold text-yellow-400">
                    {winner.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wider">Winner</p>
                  <p className="text-white font-bold">{winner.name}</p>
                  <p className="text-yellow-300 text-xs">{winner.party}</p>
                </div>
                <span className="ml-auto text-3xl">🏆</span>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 space-y-4">
                {group.map((c) => {
                  const isWinner = c.id === winnerCandidateId
                  return (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center gap-3">
                        {c.photo ? (
                          <img src={c.photo} alt={c.name} className="w-8 h-8 rounded-full object-cover bg-gray-800 shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-800 shrink-0 flex items-center justify-center text-xs font-bold text-gray-500">
                            {c.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`font-medium text-sm truncate ${isWinner ? 'text-yellow-300' : 'text-white'}`}>
                                {c.name}{isWinner ? ' 🏆' : ''}
                              </span>
                              {c.party && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${partyBadge(c.party)}`}>
                                  {c.party}
                                </span>
                              )}
                            </div>
                            <span className="font-bold text-white tabular-nums text-sm shrink-0">
                              <ProbabilityBar probability={c.probability} party={c.party} />
                            </span>
                          </div>
                          <div className="h-2 bg-gray-800 rounded-full mt-1.5 relative overflow-hidden">
                            <div
                              className="absolute top-0 h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.abs(c.spread)}%`,
                                left: c.spread >= 0 ? '50%' : `${50 - Math.abs(c.spread)}%`,
                                backgroundColor: partyColor(c.party),
                                opacity: isResolved && !isWinner ? 0.4 : 1,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )
      })}

      {!isResolved && (
        <p className="text-sm text-gray-500 text-center">
          Election in progress — odds update as predictions are placed.
        </p>
      )}
    </div>
  )
}
