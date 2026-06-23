export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          name: string
          points_remaining: number
          created_at: string
        }
        Insert: {
          id: string
          name: string
          points_remaining?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          points_remaining?: number
          created_at?: string
        }
      }
      candidates: {
        Row: {
          id: string
          name: string
          party: string
          photo: string
          position: string
          seed_points: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          party: string
          photo: string
          position?: string
          seed_points?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          party?: string
          photo?: string
          position?: string
          seed_points?: number
          created_at?: string
        }
      }
      predictions: {
        Row: {
          id: string
          user_id: string
          candidate_id: string
          points_allocated: number
          probability_at_prediction: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          candidate_id: string
          points_allocated: number
          probability_at_prediction?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          candidate_id?: string
          points_allocated?: number
          probability_at_prediction?: number
          created_at?: string
        }
      }
      election_settings: {
        Row: {
          id: number
          status: 'active' | 'resolved'
          winner_candidate_id: string | null
        }
        Insert: {
          id?: number
          status?: 'active' | 'resolved'
          winner_candidate_id?: string | null
        }
        Update: {
          id?: number
          status?: 'active' | 'resolved'
          winner_candidate_id?: string | null
        }
      }
      poll_questions: {
        Row: {
          id: string
          title: string
          position: string
          status: 'active' | 'closed'
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          position?: string
          status?: 'active' | 'closed'
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          position?: string
          status?: 'active' | 'closed'
          created_by?: string | null
          created_at?: string
        }
      }
      poll_votes: {
        Row: {
          id: string
          question_id: string
          user_id: string
          candidate_id: string
          created_at: string
        }
        Insert: {
          id?: string
          question_id: string
          user_id: string
          candidate_id: string
          created_at?: string
        }
        Update: {
          id?: string
          question_id?: string
          user_id?: string
          candidate_id?: string
          created_at?: string
        }
      }
    }
    Functions: {
      place_prediction: {
        Args: {
          p_candidate_id: string
          p_points: number
        }
        Returns: {
          success: boolean
          message: string
        }
      }
    }
  }
}

export type User = Database['public']['Tables']['users']['Row']
export type Candidate = Database['public']['Tables']['candidates']['Row']
export type Prediction = Database['public']['Tables']['predictions']['Row']
export type ElectionSettings = Database['public']['Tables']['election_settings']['Row']
export type PollQuestion = Database['public']['Tables']['poll_questions']['Row']
export type PollVote = Database['public']['Tables']['poll_votes']['Row']

export interface CandidateWithProbability extends Candidate {
  total_points: number
  probability: number
}

export interface LeaderboardEntry {
  id: string
  name: string
  points_remaining: number
  brier_score: number | null
  prediction_count: number
}
