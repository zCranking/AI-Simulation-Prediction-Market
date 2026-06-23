import type { Prediction, Candidate, CandidateWithProbability } from './types'

export function computeProbabilities(
  candidates: Candidate[] = [],
  predictions: Pick<Prediction, 'candidate_id' | 'points_allocated'>[] = []
): CandidateWithProbability[] {
  const totalPoints = predictions.reduce(
    (sum, p) => sum + p.points_allocated,
    0
  )

  return candidates.map((candidate) => {
    const candidatePoints = predictions
      .filter((p) => p.candidate_id === candidate.id)
      .reduce((sum, p) => sum + p.points_allocated, 0)

    const probability =
      totalPoints === 0
        ? 0
        : Math.round((candidatePoints / totalPoints) * 100)

    return {
      ...candidate,
      total_points: candidatePoints,   // ✅ REQUIRED (this fixes your error)
      probability,
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