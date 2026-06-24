'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '../lib/supabase/client'
import { computeProbabilities } from '../lib/market'
import ProbabilityBar from './ProbabilityBar'
import type {
  Candidate,
  Prediction,
  CandidateWithProbability,
  PollQuestion,
  PollVote,
} from '../lib/types'

interface Props {
  initialCandidates: Candidate[]
  initialPredictions: Pick<Prediction, 'candidate_id' | 'points_allocated'>[]
  initialQuestions: PollQuestion[]
  initialVotes: PollVote[]
  electionStatus: 'active' | 'resolved'
}

function partyBadgeStyle(party: string) {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'bg-amber-900/50 text-amber-300 border border-amber-700'
  if (p.includes('federalist')) return 'bg-blue-900/50 text-blue-300 border border-blue-700'
  return 'bg-gray-800 text-gray-400 border border-gray-700'
}

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
  initialQuestions,
  initialVotes,
  electionStatus,
}: Props) {
  const supabase = useMemo(() => createClient(), [])

  const [predictions, setPredictions] = useState(initialPredictions)
  const [questions, setQuestions] = useState(initialQuestions)
  const [votes, setVotes] = useState(initialVotes)
  const [candidates, setCandidates] = useState(initialCandidates)

  const positions = useMemo(() => {
    const found = [...new Set(candidates.map((c) => c.position).filter(Boolean))]
    return POSITION_ORDER.filter((p) => found.includes(p)).concat(
      found.filter((p) => !POSITION_ORDER.includes(p))
    )
  }, [candidates])

  const [selectedPosition, setActivePosition] = useState<string>(positions[0] ?? '')
  const activePosition = positions.includes(selectedPosition) ? selectedPosition : positions[0] ?? ''

  const withProb: CandidateWithProbability[] = useMemo(
    () => computeProbabilities(candidates, predictions, questions, votes),
    [candidates, predictions, questions, votes]
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
        { event: '*', schema: 'public', table: 'predictions' },
        (payload) => {
          const newPred = payload.new as Prediction

          setPredictions((prev) => {
            const exists = prev.find(
              (p) => p.candidate_id === newPred.candidate_id
            )

            if (exists) {
              return prev.map((p) =>
                p.candidate_id === newPred.candidate_id
                  ? {
                      candidate_id: newPred.candidate_id,
                      points_allocated: newPred.points_allocated,
                    }
                  : p
              )
            }

            return [
              ...prev,
              {
                candidate_id: newPred.candidate_id,
                points_allocated: newPred.points_allocated,
              },
            ]
          })
        }
      )
      .subscribe()

    const candidatesChannel = supabase
      .channel('market-candidates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidates' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCandidates((prev) => [...prev, payload.new as Candidate])
          } else if (payload.eventType === 'UPDATE') {
            setCandidates((prev) =>
              prev.map((c) => (c.id === payload.new.id ? (payload.new as Candidate) : c))
            )
          } else if (payload.eventType === 'DELETE') {
            setCandidates((prev) => prev.filter((c) => c.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    const questionsChannel = supabase
      .channel('market-poll-questions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_questions' },
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

    const votesChannel = supabase
      .channel('market-poll-votes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes' },
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
      supabase.removeChannel(channel)
      supabase.removeChannel(candidatesChannel)
      supabase.removeChannel(questionsChannel)
      supabase.removeChannel(votesChannel)
    }
  }, [electionStatus, supabase])

  const totalPoints = predictions.reduce((sum, p) => sum + p.points_allocated, 0)

  const multiWinnerNote: Record<string, string> = {
    'Supreme Court Justice': 'Top 7 candidates win',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">State Primary Elections</h2>
          <p className="text-gray-400 text-sm mt-1">
            {totalPoints.toLocaleString()} predictions submitted
          </p>
        </div>

        <div>
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

      <div className="flex gap-1.5 flex-wrap">
        {positions.map((pos) => (
          <button
            key={pos}
            onClick={() => setActivePosition(pos)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activePosition === pos
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {activePosition && (
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold text-white">{activePosition}</h3>
          {multiWinnerNote[activePosition] && (
            <span className="text-xs text-indigo-400 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded-full">
              {multiWinnerNote[activePosition]}
            </span>
          )}
          <span className="text-sm text-gray-500">
            {visibleCandidates.length} candidate
            {visibleCandidates.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

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
                    className="w-12 h-12 rounded-full object-cover bg-gray-800 border-2 border-gray-700"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center text-gray-600 font-bold">
                    {c.name.charAt(0)}
                  </div>
                )}

                <div>
                  <h3 className="font-semibold text-white text-sm group-hover:text-indigo-300">
                    {c.name}
                  </h3>

                  {c.party && (
                    <span
                      className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded-md font-medium ${partyBadgeStyle(
                        c.party
                      )}`}
                    >
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
        Chances update live as predictions are placed and community questions are answered.
      </p>
    </div>
  )
}
