// App-level types, derived from the generated schema types in
// ./database.types.ts (regenerate that file after migrations).
import type { Database } from './database.types'

export type { Database, Json } from './database.types'

export type MarketType = 'single_winner' | 'binary' | 'multi_winner'
export type MarketStatus = 'draft' | 'active' | 'resolved' | 'voided'

type Tables = Database['public']['Tables']

export type User = Tables['users']['Row']
export type MarketGroup = Tables['market_groups']['Row']
export type MarketOutcome = Tables['market_outcomes']['Row']
export type Stake = Tables['stakes']['Row']
export type AiForecast = Tables['ai_forecasts']['Row']
export type PollQuestion = Tables['poll_questions']['Row']
export type PollVote = Tables['poll_votes']['Row']

/** markets Row with the check-constrained text columns narrowed to their unions */
export interface Market extends Omit<Tables['markets']['Row'], 'market_type' | 'status'> {
  market_type: MarketType
  status: MarketStatus
}

export interface OutcomeWithProbability extends MarketOutcome {
  /** Crowd probability (0–100) after smoothing + community nudge */
  probability: number
  /** Latest AI Analyst probability for this outcome, if any */
  ai_probability: number | null
  /** Latest AI Analyst rationale for this outcome, if any */
  ai_rationale: string | null
}

/** JSON payload returned by the place_stake RPC (cast the Json result to this) */
export interface StakeResult {
  success: boolean
  message: string
  balance_remaining?: number
  probability_at_stake?: number
}

/** Row shape of get_leaderboard_v2 with real nullability (the generated
    types can't see that id/points_remaining/brier_score are null for the
    AI row / unresolved markets) */
export interface LeaderboardEntry {
  participant_type: 'user' | 'ai'
  id: string | null
  name: string
  points_remaining: number | null
  prediction_count: number
  brier_score: number | null
}
