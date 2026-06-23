'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '../lib/supabase/client'
import { computeProbabilities } from '../lib/market'
import ProbabilityBar from './ProbabilityBar'
import type { Candidate, Prediction, CandidateWithProbability } from '../lib/types'

interface Props {
  initialCandidates: Candidate[]
  initialPredictions: Pick<Prediction, 'candidate_id' | 'points_allocated'>[]
  electionStatus: 'active' | 'resolved'
}

function partyBadgeStyle(party: string) {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'bg-amber-900/50 text-amber-300 border border-amber-700'
  if (p.includes('federalist')) return 'bg-blue-900/50 text-blue-300 border border-blue-700'
  return 'bg-gray-800 text-gray-400 border border-gray-700'
}

// Ordered list so tabs appear in a logical ballot order
const POSITION_ORDER = [
  'Governor',
  'Lt. Governor',
  'Attorney General',
  'Secretary of State',
  'Controller',
  'State Treasurer',
  'Insurance Commissioner',
  'Superintendent of Public Instruction',
  'Supreme Court Justice',
]

export default function RealtimeMarket({
  initialCandidates,
  initialPredictions,
  electionStatus,
}: Props) {
  const supabase = createClient()
  const [predictions, setPredictions] = useState(initialPredictions)
  const [candidates] = useState(initialCandidates)

  // Derive ordered positions from candidates
  const positions = useMemo(() => {
    const found = [...new Set(candidates.map((c) => c.position).filter(Boolean))]
    return POSITION_ORDER.filter((p) => found.includes(p)).concat(
      found.filter((p) => !POSITION_ORDER.includes(p))
    )
  }, [candidates])

  const [activePosition, setActivePosition] = useState<string>(positions[0] ?? '')

  const withProb: CandidateWithProbability[] = useMemo(
    () => computeProbabilities(candidates, predictions),
    [candidates, predictions]
  )

  const visibleCandidates = useMemo(
    () => withProb.filter((c) => c.position === activePosition),
    [withProb, activePosition]
  )

  useEffect(() => {
    if (electionStatus !== 'active') return
    const channel = supabase
      .channel('market-predictions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'predictions' },
        (payload) => {
          const newPred = payload.new as Prediction
          setPredictions((prev) => [
            ...prev,
            { candidate_id: newPred.candidate_id, points_allocated: newPred.points_allocated },
          ])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [electionStatus])

  const totalPoints = predictions.reduce((sum, p) => sum + p.points_allocated, 0)

  // Note for multi-winner races
  const multiWinnerNote: Record<string, string> = {
    'Supreme Court Justice': 'Top 7 candidates win',
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">State Primary Elections</h2>
          <p className="text-gray-400 text-sm mt-1">
            {totalPoints.toLocaleString()} predictions submitted
          </p>
        </div>
        <div className="flex items-center gap-2">
          {electionStatus === 'active' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-950 border border-green-700 text-green-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-400 text-xs font-semibold">
              CLOSED
            </span>
          )}
        </div>
      </div>

      {/* Position tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {positions.map((pos) => (
          <button
            key={pos}
            onClick={() => setActivePosition(pos)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activePosition === pos
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Position header */}
      {activePosition && (
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold text-white">{activePosition}</h3>
          {multiWinnerNote[activePosition] && (
            <span className="text-xs text-indigo-400 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded-full">
              {multiWinnerNote[activePosition]}
            </span>
          )}
          <span className="text-sm text-gray-500">
            {visibleCandidates.length} candidate{visibleCandidates.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Candidate grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleCandidates
          .sort((a, b) => b.probability - a.probability)
          .map((c) => (
            <Link
              key={c.id}
              href={`/candidates/${c.id}`}
              className="group bg-gray-900 border border-gray-800 hover:border-indigo-600 rounded-2xl p-4 transition-all"
            >
              <div className="flex items-start gap-3 mb-3">
                {c.photo ? (
                  <img
                    src={c.photo}
                    alt={c.name}
                    className="w-12 h-12 rounded-full object-cover bg-gray-800 border-2 border-gray-700 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-gray-700 shrink-0 flex items-center justify-center text-gray-600 text-lg font-bold">
                    {c.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white text-sm leading-tight truncate group-hover:text-indigo-300 transition-colors">
                    {c.name}
                  </h3>
                  {c.party && (
                    <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-md font-medium ${partyBadgeStyle(c.party)}`}>
                      {c.party}
                    </span>
                  )}
                </div>
              </div>
              <ProbabilityBar probability={c.probability} party={c.party} />
            </Link>
          ))}
      </div>

      <p className="text-xs text-gray-500 text-center">
        Chances update live as predictions are placed.
      </p>
    </div>
  )
}