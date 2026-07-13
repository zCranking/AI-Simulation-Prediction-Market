-- ============================================================
-- 0001 — LEGACY BASELINE (reference only)
--
-- Documents the schema that already exists in production, which
-- was originally applied by hand via the Supabase SQL editor from
-- ../schema.sql (now frozen as a historical reference).
--
-- DO NOT apply this file to the original production project — the
-- objects already exist there. Run it ONLY when bootstrapping a
-- brand-new Supabase project, before 0002+.
-- ============================================================

-- 1. USERS (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  points_remaining INTEGER NOT NULL DEFAULT 1000,
  setup_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CANDIDATES (legacy — superseded by market_outcomes in 0002)
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  party TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  base_probability FLOAT NOT NULL DEFAULT 0 CHECK (base_probability >= 0 AND base_probability <= 100),
  seed_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PREDICTIONS (legacy — superseded by stakes in 0002)
CREATE TABLE IF NOT EXISTS public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  points_allocated INTEGER NOT NULL CHECK (points_allocated > 0),
  probability_at_prediction FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3b. COMMUNITY QUESTIONS
CREATE TABLE IF NOT EXISTS public.poll_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.poll_questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, user_id)
);

-- 4. ELECTION SETTINGS (legacy singleton — superseded by markets.status in 0002)
CREATE TABLE IF NOT EXISTS public.election_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  winner_candidate_id UUID REFERENCES public.candidates(id)
);

INSERT INTO public.election_settings (id, status, winner_candidate_id)
VALUES (1, 'active', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_predictions_candidate ON public.predictions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON public.predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_question ON public.poll_votes(question_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_candidate ON public.poll_votes(candidate_id);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.election_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_all" ON public.users;
CREATE POLICY "users_read_all" ON public.users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "candidates_read_all" ON public.candidates;
CREATE POLICY "candidates_read_all" ON public.candidates
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "predictions_read_own" ON public.predictions;
CREATE POLICY "predictions_read_own" ON public.predictions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "election_settings_read" ON public.election_settings;
CREATE POLICY "election_settings_read" ON public.election_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "poll_questions_read_all" ON public.poll_questions;
CREATE POLICY "poll_questions_read_all" ON public.poll_questions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "poll_questions_insert_own" ON public.poll_questions;
CREATE POLICY "poll_questions_insert_own" ON public.poll_questions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

DROP POLICY IF EXISTS "poll_votes_read_all" ON public.poll_votes;
CREATE POLICY "poll_votes_read_all" ON public.poll_votes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "poll_votes_insert_own" ON public.poll_votes;
CREATE POLICY "poll_votes_insert_own" ON public.poll_votes
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "poll_votes_update_own" ON public.poll_votes;
CREATE POLICY "poll_votes_update_own" ON public.poll_votes
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, name, points_remaining)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Anonymous'
    ),
    1000
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Storage bucket for outcome photos (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Realtime for legacy tables
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['predictions', 'candidates', 'election_settings', 'poll_questions', 'poll_votes'] LOOP
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
