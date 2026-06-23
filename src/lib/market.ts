import type { Prediction, CandidateWithProbability, Candidate } from './types'

/**
 * Compute parimutuel probabilities from raw predictions.
 * Probabilities are scoped per-position so each race is independent.
 */
export function computeProbabilities(
  candidates: Candidate[],
  predictions: Pick<Prediction, 'candidate_id' | 'points_allocated'>[]
): CandidateWithProbability[] {
  // Group by position so each race's probabilities sum to 100%
  const positions = [...new Set(candidates.map((c) => c.position ?? ''))]

  return positions.flatMap((pos) => {
    const group = candidates.filter((c) => (c.position ?? '') === pos)
    const wagers: Record<string, number> = {}
    const effective: Record<string, number> = {}

    for (const c of group) {
      wagers[c.id] = 0
      effective[c.id] = c.seed_points ?? 0
    }
    for (const p of predictions) {
      if (wagers[p.candidate_id] !== undefined) {
        wagers[p.candidate_id] += p.points_allocated
        effective[p.candidate_id] += p.points_allocated
      }
    }

    const grandEffective = Object.values(effective).reduce((sum, v) => sum + v, 0)

    return group.map((c) => ({
      ...c,
      total_points: wagers[c.id],
      probability:
        grandEffective === 0 ? 100 / group.length : (effective[c.id] / grandEffective) * 100,
    }))
  })
}

/**
 * Brier Score for a single prediction.
 * BS = (predicted_probability - outcome)^2
 * outcome = 1 if this candidate won, 0 otherwise
 */
export function brierScore(predictedProbability: number, won: boolean): number {
  const p = predictedProbability / 100
  const o = won ? 1 : 0
  return Math.pow(p - o, 2)
}

/**
 * Average Brier Score across multiple predictions.
 * Lower = more accurate (0 = perfect, 1 = worst).
 */
export function averageBrierScore(
  predictions: Pick<Prediction, 'candidate_id' | 'probability_at_prediction'>[],
  winnerCandidateId: string
): number {
  if (predictions.length === 0) return 0
  const scores = predictions.map((p) =>
    brierScore(p.probability_at_prediction, p.candidate_id === winnerCandidateId)
  )
  return scores.reduce((sum, s) => sum + s, 0) / scores.length
}

export function partyColor(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'bg-amber-500'
  if (p.includes('federalist')) return 'bg-blue-500'
  return 'bg-gray-500'
}

export function partyTextColor(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'text-amber-600'
  if (p.includes('federalist')) return 'text-blue-600'
  return 'text-gray-600'
}
