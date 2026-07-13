// Generated from the live Supabase project via `supabase gen types typescript`
// (MCP generate_typescript_types). Regenerate after schema migrations —
// do not hand-edit. App-level narrowed types live in ./types.ts.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_forecasts: {
        Row: {
          created_at: string
          id: string
          input_snapshot: Json | null
          market_id: string
          model: string
          outcome_id: string
          probability: number
          rationale: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_snapshot?: Json | null
          market_id: string
          model?: string
          outcome_id: string
          probability: number
          rationale?: string
        }
        Update: {
          created_at?: string
          id?: string
          input_snapshot?: Json | null
          market_id?: string
          model?: string
          outcome_id?: string
          probability?: number
          rationale?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_forecasts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_forecasts_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          base_probability: number
          created_at: string
          id: string
          name: string
          party: string
          photo: string
          position: string
          seed_points: number
        }
        Insert: {
          base_probability?: number
          created_at?: string
          id?: string
          name: string
          party: string
          photo?: string
          position?: string
          seed_points?: number
        }
        Update: {
          base_probability?: number
          created_at?: string
          id?: string
          name?: string
          party?: string
          photo?: string
          position?: string
          seed_points?: number
        }
        Relationships: []
      }
      election_settings: {
        Row: {
          id: number
          status: string
          winner_candidate_id: string | null
        }
        Insert: {
          id?: number
          status?: string
          winner_candidate_id?: string | null
        }
        Update: {
          id?: number
          status?: string
          winner_candidate_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "election_settings_winner_candidate_id_fkey"
            columns: ["winner_candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      market_groups: {
        Row: {
          created_at: string
          description: string
          id: string
          slug: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          slug: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          slug?: string
          title?: string
        }
        Relationships: []
      }
      market_outcomes: {
        Row: {
          base_probability: number
          created_at: string
          id: string
          is_winner: boolean | null
          label: string
          market_id: string
          party: string
          photo_url: string
          sort_order: number
          total_points: number
        }
        Insert: {
          base_probability?: number
          created_at?: string
          id?: string
          is_winner?: boolean | null
          label: string
          market_id: string
          party?: string
          photo_url?: string
          sort_order?: number
          total_points?: number
        }
        Update: {
          base_probability?: number
          created_at?: string
          id?: string
          is_winner?: boolean | null
          label?: string
          market_id?: string
          party?: string
          photo_url?: string
          sort_order?: number
          total_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "market_outcomes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          group_id: string | null
          id: string
          market_type: string
          resolved_at: string | null
          resolves_at: string | null
          slug: string
          status: string
          title: string
          updated_at: string
          winners_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          group_id?: string | null
          id?: string
          market_type?: string
          resolved_at?: string | null
          resolves_at?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
          winners_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          group_id?: string | null
          id?: string
          market_type?: string
          resolved_at?: string | null
          resolves_at?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          winners_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "markets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "market_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_questions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          market_id: string | null
          position: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          market_id?: string | null
          position?: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          market_id?: string | null
          position?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_questions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          candidate_id: string | null
          created_at: string
          id: string
          outcome_id: string | null
          question_id: string
          user_id: string
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          id?: string
          outcome_id?: string | null
          question_id: string
          user_id: string
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          id?: string
          outcome_id?: string | null
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "poll_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          points_allocated: number
          probability_at_prediction: number
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          points_allocated: number
          probability_at_prediction?: number
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          points_allocated?: number
          probability_at_prediction?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stakes: {
        Row: {
          created_at: string
          id: string
          market_id: string
          outcome_id: string
          points_staked: number
          probability_at_stake: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          outcome_id: string
          points_staked: number
          probability_at_stake?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          outcome_id?: string
          points_staked?: number
          probability_at_stake?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stakes_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stakes_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "market_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stakes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          id: string
          name: string
          points_remaining: number
          setup_completed: boolean | null
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          points_remaining?: number
          setup_completed?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          points_remaining?: number
          setup_completed?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_outcome_probability: {
        Args: { p_outcome_id: string }
        Returns: number
      }
      get_leaderboard: {
        Args: never
        Returns: {
          brier_score: number
          id: string
          name: string
          points_remaining: number
          prediction_count: number
        }[]
      }
      get_leaderboard_v2: {
        Args: never
        Returns: {
          brier_score: number
          id: string
          name: string
          participant_type: string
          points_remaining: number
          prediction_count: number
        }[]
      }
      place_prediction: {
        Args: { p_candidate_id: string; p_points: number }
        Returns: Json
      }
      place_stake: {
        Args: { p_outcome_id: string; p_points: number }
        Returns: Json
      }
      resolve_market: {
        Args: { p_market_id: string; p_winner_outcome_ids: string[] }
        Returns: Json
      }
      void_market: { Args: { p_market_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
