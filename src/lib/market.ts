import type {
  Prediction,
  Candidate,
  CandidateWithProbability,
  PollQuestion,
  PollVote,
} from './types'

const COMMUNITY_WEIGHT = 0.12
const MAX_COMMUNITY_NUDGE = 6

function clampProbability(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function roundProbability(value: number): number {
  return Math.round(clampProbability(value) * 10) / 10
}

function getBaseProbability(
  candidate: Candidate,
  predictionProbability: number
): number {
  if (typeof candidate.base_probability === 'number') {
    return clampProbability(candidate.base_probability)
  }

  return predictionProbability
}

function getCommunityShare(
  candidate: Candidate,
  questions: PollQuestion[],
  votes: PollVote[]
): number | null {
  const relevantQuestionIds = new Set(
    questions
      .filter(
        (q) =>
          q.status === 'active' &&
          (!q.position || q.position === candidate.position)
      )
      .map((q) => q.id)
  )

  if (relevantQuestionIds.size === 0) return null

  const relevantVotes = votes.filter((v) => relevantQuestionIds.has(v.question_id))
  if (relevantVotes.length === 0) return null

  const candidateVotes = relevantVotes.filter((v) => v.candidate_id === candidate.id).length
  return (candidateVotes / relevantVotes.length) * 100
}

function applyCommunityNudge(
  baseProbability: number,
  communityShare: number | null
): number {
  if (communityShare === null) return roundProbability(baseProbability)

  const rawNudge = (communityShare - baseProbability) * COMMUNITY_WEIGHT
  const cappedNudge = Math.max(
    -MAX_COMMUNITY_NUDGE,
    Math.min(MAX_COMMUNITY_NUDGE, rawNudge)
  )

  return roundProbability(baseProbability + cappedNudge)
}

export function computeProbabilities(
  candidates: Candidate[] = [],
  predictions: Pick<Prediction, 'candidate_id' | 'points_allocated'>[] = [],
  pollQuestions: PollQuestion[] = [],
  pollVotes: PollVote[] = []
): CandidateWithProbability[] {
  const totalPoints = predictions.reduce(
    (sum, p) => sum + p.points_allocated,
    0
  )

  return candidates.map((candidate) => {
    const candidatePoints = predictions
      .filter((p) => p.candidate_id === candidate.id)
      .reduce((sum, p) => sum + p.points_allocated, 0)

    const predictionProbability =
      totalPoints === 0 ? 0 : (candidatePoints / totalPoints) * 100
    const baseProbability = getBaseProbability(candidate, predictionProbability)
    const communityShare = getCommunityShare(candidate, pollQuestions, pollVotes)

    return {
      ...candidate,
      total_points: candidatePoints,
      probability: applyCommunityNudge(baseProbability, communityShare),
    }
  })
}

/**
 * Brier Score for a single prediction.
 * BS = (predicted_probability - outcome)^2
 * outcome = 1 if this candidate won, 0 otherwise
 */
export function brierScore(
  predictedProbability: number,
  won: boolean
): number {
  const p = predictedProbability / 100
  const o = won ? 1 : 0
  return Math.pow(p - o, 2)
}

/**
 * Average Brier Score across multiple predictions.
 * Lower = more accurate (0 = perfect, 1 = worst).
 */
export function averageBrierScore(
  predictions: Pick<
    Prediction,
    'candidate_id' | 'probability_at_prediction'
  >[],
  winnerCandidateId: string
): number {
  if (!predictions.length) return 0

  const scores = predictions.map((p) =>
    brierScore(
      p.probability_at_prediction,
      p.candidate_id === winnerCandidateId
    )
  )

  return scores.reduce((sum, s) => sum + s, 0) / scores.length
}

/**
 * UI helper: party colors
 */
export function partyColor(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'bg-amber-500'
  if (p.includes('federalist')) return 'bg-blue-500'
  return 'bg-gray-500'
}

/**
 * UI helper: party text colors
 */
export function partyTextColor(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'text-amber-600'
  if (p.includes('federalist')) return 'text-blue-600'
  return 'text-gray-600'
}
