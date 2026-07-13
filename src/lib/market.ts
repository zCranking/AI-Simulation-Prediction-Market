import type {
  MarketOutcome,
  OutcomeWithProbability,
  PollQuestion,
  PollVote,
  AiForecast,
} from './types'

const COMMUNITY_WEIGHT = 0.12
const MAX_COMMUNITY_NUDGE = 6
/** Virtual points behind the prior — mirrors compute_outcome_probability() in
    supabase/migrations/0004_market_rpcs.sql. Keep in sync. */
const PRIOR_WEIGHT = 100
/** Payout multiplier cap — mirrors resolve_market() in 0004. Keep in sync. */
const MAX_PAYOUT_MULTIPLIER = 6

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function round1(value: number): number {
  return Math.round(clamp(value) * 10) / 10
}

/**
 * Crowd probability with Bayesian smoothing: the admin-set base_probability
 * (or a uniform prior when unset) acts as PRIOR_WEIGHT virtual points, so a
 * fresh market isn't whipsawed by the first stake and converges to the true
 * stake share as volume grows.
 */
function smoothedProbability(outcome: MarketOutcome, race: MarketOutcome[]): number {
  const raceTotal = race.reduce((sum, o) => sum + o.total_points, 0)
  const prior = outcome.base_probability > 0 ? outcome.base_probability : 100 / race.length
  return ((prior + outcome.total_points) / (PRIOR_WEIGHT + raceTotal)) * 100
}

function communityShare(
  outcome: MarketOutcome,
  questions: PollQuestion[],
  votes: PollVote[]
): number | null {
  const relevantQuestionIds = new Set(
    questions
      .filter((q) => q.status === 'active' && q.market_id === outcome.market_id)
      .map((q) => q.id)
  )
  if (relevantQuestionIds.size === 0) return null

  const relevantVotes = votes.filter((v) => relevantQuestionIds.has(v.question_id))
  if (relevantVotes.length === 0) return null

  const mine = relevantVotes.filter((v) => v.outcome_id === outcome.id).length
  return (mine / relevantVotes.length) * 100
}

function applyCommunityNudge(base: number, share: number | null): number {
  if (share === null) return round1(base)
  const nudge = Math.max(
    -MAX_COMMUNITY_NUDGE,
    Math.min(MAX_COMMUNITY_NUDGE, (share - base) * COMMUNITY_WEIGHT)
  )
  return round1(base + nudge)
}

/** Latest forecast per outcome, from a list ordered any way. */
export function latestForecastByOutcome(forecasts: AiForecast[]): Map<string, AiForecast> {
  const latest = new Map<string, AiForecast>()
  for (const f of forecasts) {
    const existing = latest.get(f.outcome_id)
    if (!existing || f.created_at > existing.created_at) latest.set(f.outcome_id, f)
  }
  return latest
}

export function computeOutcomeProbabilities(
  outcomes: MarketOutcome[],
  pollQuestions: PollQuestion[] = [],
  pollVotes: PollVote[] = [],
  aiForecasts: AiForecast[] = []
): OutcomeWithProbability[] {
  const latestAi = latestForecastByOutcome(aiForecasts)

  return outcomes.map((outcome) => {
    const race = outcomes.filter((o) => o.market_id === outcome.market_id)
    const base = smoothedProbability(outcome, race)
    const share = communityShare(outcome, pollQuestions, pollVotes)
    const ai = latestAi.get(outcome.id)

    return {
      ...outcome,
      probability: applyCommunityNudge(base, share),
      ai_probability: ai ? round1(ai.probability) : null,
      ai_rationale: ai?.rationale ?? null,
    }
  })
}

/** Payout multiplier shown to users before staking — matches resolve_market(). */
export function payoutMultiplier(probability: number): number {
  const p = Math.max(1, probability)
  return Math.round(Math.min(100 / p, MAX_PAYOUT_MULTIPLIER) * 100) / 100
}

export function partyColor(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return '#f59e0b'
  if (p.includes('federalist')) return '#3b82f6'
  return '#6366f1'
}

export function partyBadgeStyle(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('whig')) return 'bg-amber-900/50 text-amber-300 border border-amber-700'
  if (p.includes('federalist')) return 'bg-blue-900/50 text-blue-300 border border-blue-700'
  return 'bg-gray-800 text-gray-400 border border-gray-700'
}
