-- ============================================================
-- 0002 — MULTI-MARKET SCHEMA
--
-- Generalizes the single hardcoded election into a Kalshi-style
-- exchange: market_groups (cosmetic clustering) → markets (the
-- atomic unit: one race or one standalone question) →
-- market_outcomes (candidates / Yes-No options).
--
-- stakes replaces predictions (real point deduction, see 0004).
-- ai_forecasts stores the AI Analyst's probability + rationale
-- per outcome per forecast run.
--
-- market_outcomes.total_points is an aggregate maintained
-- atomically by the place_stake RPC. This is deliberate: stakes
-- have a read-own-only RLS policy, so clients can never compute
-- crowd totals from raw stakes (the legacy app had exactly this
-- bug — probabilities were computed from only the viewer's own
-- predictions). The aggregate column is publicly readable and
-- realtime-enabled instead.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.market_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.market_groups(id) ON DELETE SET NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  market_type TEXT NOT NULL DEFAULT 'single_winner'
    CHECK (market_type IN ('single_winner', 'binary', 'multi_winner')),
  winners_count INTEGER NOT NULL DEFAULT 1 CHECK (winners_count > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'resolved', 'voided')),
  resolves_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.market_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  party TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  base_probability DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (base_probability >= 0 AND base_probability <= 100),
  total_points INTEGER NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  is_winner BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, label)
);

CREATE TABLE IF NOT EXISTS public.stakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome_id UUID NOT NULL REFERENCES public.market_outcomes(id) ON DELETE CASCADE,
  points_staked INTEGER NOT NULL CHECK (points_staked > 0),
  probability_at_stake DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome_id UUID NOT NULL REFERENCES public.market_outcomes(id) ON DELETE CASCADE,
  probability DOUBLE PRECISION NOT NULL CHECK (probability >= 0 AND probability <= 100),
  rationale TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  input_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markets_group ON public.markets(group_id);
CREATE INDEX IF NOT EXISTS idx_markets_status ON public.markets(status);
CREATE INDEX IF NOT EXISTS idx_outcomes_market ON public.market_outcomes(market_id);
CREATE INDEX IF NOT EXISTS idx_stakes_market ON public.stakes(market_id);
CREATE INDEX IF NOT EXISTS idx_stakes_outcome ON public.stakes(outcome_id);
CREATE INDEX IF NOT EXISTS idx_stakes_user ON public.stakes(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_market ON public.ai_forecasts(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_outcome ON public.ai_forecasts(outcome_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.market_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_forecasts ENABLE ROW LEVEL SECURITY;

-- Market data: public read. All writes go through service-role
-- admin actions or SECURITY DEFINER RPCs — no write policies.
DROP POLICY IF EXISTS "market_groups_read" ON public.market_groups;
CREATE POLICY "market_groups_read" ON public.market_groups
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "markets_read" ON public.markets;
CREATE POLICY "markets_read" ON public.markets
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "market_outcomes_read" ON public.market_outcomes;
CREATE POLICY "market_outcomes_read" ON public.market_outcomes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ai_forecasts_read" ON public.ai_forecasts;
CREATE POLICY "ai_forecasts_read" ON public.ai_forecasts
  FOR SELECT TO anon, authenticated USING (true);

-- Stakes: users see only their own. Inserts happen exclusively
-- via the place_stake SECURITY DEFINER RPC (0004).
DROP POLICY IF EXISTS "stakes_read_own" ON public.stakes;
CREATE POLICY "stakes_read_own" ON public.stakes
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── Realtime ────────────────────────────────────────────────
-- users is included so the nav balance updates live after staking.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['markets', 'market_outcomes', 'ai_forecasts', 'users'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
