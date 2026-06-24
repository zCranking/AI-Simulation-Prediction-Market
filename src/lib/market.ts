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

  const relevantVotes = votes.filter((v) =>
    relevantQuestionIds.has(v.question_id)
  )

  if (relevantVotes.length === 0) return null

  const candidateVotes = relevantVotes.filter(
    (v) => v.candidate_id === candidate.id
  ).length

  return (candidateVotes / relevantVotes.length) * 100
}

function applyCommunityNudge(
  baseProbability: number,
  communityShare: number | null
): number {
  if (communityShare === null) {
    return roundProbability(baseProbability)
  }

  const rawNudge =
    (communityShare - baseProbability) * COMMUNITY_WEIGHT

  const cappedNudge = Math.max(
    -MAX_COMMUNITY_NUDGE,
    Math.min(MAX_COMMUNITY_NUDGE, rawNudge)
  )

  return roundProbability(baseProbability + cappedNudge)
}

export function computeProbabilities(
  candidates: Candidate[] = [],
  predictions: Pick<
    Prediction,
    'candidate_id' | 'points_allocated'
  >[] = [],
  pollQuestions: PollQuestion[] = [],
  pollVotes: PollVote[] = []
): CandidateWithProbability[] {
  return candidates.map((candidate) => {
    const raceCandidates = candidates.filter(
      (c) => c.position === candidate.position
    )

    const raceIds = new Set(raceCandidates.map((c) => c.id))

    const racePredictions = predictions.filter((p) =>
      raceIds.has(p.candidate_id)
    )

    const raceTotalPoints = racePredictions.reduce(
      (sum, p) => sum + p.points_allocated,
      0
    )

    const candidatePoints = racePredictions
      .filter((p) => p.candidate_id === candidate.id)
      .reduce((sum, p) => sum + p.points_allocated, 0)

    // 🔥 CENTERED MARKET MODEL (KEY FIX)
    const marketProbability =
      raceTotalPoints === 0
        ? 50
        : (candidatePoints / raceTotalPoints) * 100

    const baseProbability = getBaseProbability(
      candidate,
      marketProbability
    )

    const communityShare = getCommunityShare(
      candidate,
      pollQuestions,
      pollVotes
    )

    const finalProbability = applyCommunityNudge(
      baseProbability,
      communityShare
    )

    return {
      ...candidate,
      total_points: candidatePoints,
      probability: finalProbability,
      spread: roundProbability(finalProbability - 50),
    }
  })
}

export function partyColor(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'bg-amber-500'
  if (p.includes('federalist')) return 'bg-blue-500'
  return 'bg-gray-500'
}