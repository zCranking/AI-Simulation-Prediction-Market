-- ============================================================
-- ELECTION PREDICTION MARKET — Supabase SQL Setup
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- 1. USERS (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  points_remaining INTEGER NOT NULL DEFAULT 1000,
  setup_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CANDIDATES
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

-- 3. PREDICTIONS
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

-- 4. ELECTION SETTINGS (single-row control table)
CREATE TABLE IF NOT EXISTS public.election_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  winner_candidate_id UUID REFERENCES public.candidates(id)
);

-- Seed the single row
INSERT INTO public.election_settings (id, status, winner_candidate_id)
VALUES (1, 'active', NULL)
ON CONFLICT (id) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_predictions_candidate ON public.predictions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON public.predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_question ON public.poll_votes(question_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_candidate ON public.poll_votes(candidate_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.election_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- USERS: anyone authenticated can read (for leaderboard); only own row for sensitive data
DROP POLICY IF EXISTS "users_read_all" ON public.users;
CREATE POLICY "users_read_all" ON public.users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- CANDIDATES: public read, no direct writes (use Supabase dashboard or admin RPC)
DROP POLICY IF EXISTS "candidates_read_all" ON public.candidates;
CREATE POLICY "candidates_read_all" ON public.candidates
  FOR SELECT TO anon, authenticated USING (true);

-- PREDICTIONS: users see only their own
DROP POLICY IF EXISTS "predictions_read_own" ON public.predictions;
CREATE POLICY "predictions_read_own" ON public.predictions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ELECTION SETTINGS: public read
DROP POLICY IF EXISTS "election_settings_read" ON public.election_settings;
CREATE POLICY "election_settings_read" ON public.election_settings
  FOR SELECT TO anon, authenticated USING (true);

-- POLL QUESTIONS: authenticated users can read and create
DROP POLICY IF EXISTS "poll_questions_read_all" ON public.poll_questions;
CREATE POLICY "poll_questions_read_all" ON public.poll_questions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "poll_questions_insert_own" ON public.poll_questions;
CREATE POLICY "poll_questions_insert_own" ON public.poll_questions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

-- POLL VOTES: authenticated users can read all and upsert their own vote
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

-- ============================================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- ============================================================

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

-- ============================================================
-- ATOMIC PLACE PREDICTION RPC
-- Prevents overspending via FOR UPDATE row lock
-- ============================================================

CREATE OR REPLACE FUNCTION public.place_prediction(
  p_candidate_id UUID,
  p_points INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_election_status TEXT;
  v_total_points BIGINT;
  v_candidate_points BIGINT;
  v_prediction_points INTEGER := 1;
  v_probability FLOAT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  -- Check election is still active
  SELECT status INTO v_election_status FROM election_settings WHERE id = 1;
  IF v_election_status != 'active' THEN
    RETURN json_build_object('success', false, 'message', 'Election is closed');
  END IF;

  -- Ignore client-provided points and count each prediction equally.
  IF p_points > 0 THEN
    v_prediction_points := 1;
  END IF;

  -- Calculate current probability (before this prediction)
  SELECT COALESCE(SUM(points_allocated), 0) INTO v_total_points FROM predictions;
  SELECT COALESCE(SUM(points_allocated), 0) INTO v_candidate_points
    FROM predictions WHERE candidate_id = p_candidate_id;

  IF (v_total_points + v_prediction_points) = 0 THEN
    v_probability := 50.0;
  ELSE
    v_probability := ROUND(((v_candidate_points + v_prediction_points)::FLOAT / (v_total_points + v_prediction_points)) * 100, 2);
  END IF;

  -- Insert prediction
  INSERT INTO predictions (user_id, candidate_id, points_allocated, probability_at_prediction)
  VALUES (v_user_id, p_candidate_id, v_prediction_points, v_probability);

  RETURN json_build_object(
    'success', true,
    'message', 'Prediction placed successfully'
  );
END;
$$;

-- ============================================================
-- LEADERBOARD FUNCTION (accuracy, after election resolves)
-- Uses SECURITY DEFINER so it can read all predictions for
-- aggregate scoring, but access is restricted to authenticated
-- users only via explicit GRANT.
-- ============================================================

DROP VIEW IF EXISTS public.leaderboard_accuracy;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  id UUID,
  name TEXT,
  points_remaining INTEGER,
  prediction_count BIGINT,
  brier_score FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    u.id,
    u.name,
    u.points_remaining,
    COUNT(p.id) AS prediction_count,
    CASE
      WHEN es.status = 'resolved' AND COUNT(p.id) > 0 THEN
        AVG(
          POWER(
            (p.probability_at_prediction / 100.0) -
            CASE WHEN p.candidate_id = es.winner_candidate_id THEN 1.0 ELSE 0.0 END,
            2
          )
        )
      ELSE NULL
    END AS brier_score
  FROM public.users u
  LEFT JOIN public.predictions p ON p.user_id = u.id
  CROSS JOIN public.election_settings es
  WHERE es.id = 1
  GROUP BY u.id, u.name, u.points_remaining, es.status, es.winner_candidate_id;
$$;

-- Restrict access: anon cannot call this function
REVOKE ALL ON FUNCTION public.get_leaderboard() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;

-- ============================================================
-- REALTIME (enable for live probability updates)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'predictions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.predictions;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'election_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.election_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'poll_questions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_questions;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'poll_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
  END IF;
END $$;

-- ============================================================
-- SAMPLE CANDIDATES (optional — delete before real use)
-- ============================================================
INSERT INTO public.candidates (name, party, photo) VALUES
  ('Alex Johnson', 'Democratic', ''),
  ('Maria Santos', 'Republican', ''),
  ('Jordan Lee', 'Independent', '')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ADMIN PANEL ADDITIONS
-- Run these after the main schema if upgrading an existing DB
-- ============================================================

ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS seed_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT '';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS base_probability FLOAT NOT NULL DEFAULT 0;
ALTER TABLE public.candidates
  DROP CONSTRAINT IF EXISTS candidates_base_probability_check;
ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_base_probability_check
  CHECK (base_probability >= 0 AND base_probability <= 100);

WITH position_totals AS (
  SELECT position, SUM(seed_points) AS total_seed_points
  FROM public.candidates
  GROUP BY position
)
UPDATE public.candidates c
SET base_probability = ROUND(((c.seed_points::NUMERIC / pt.total_seed_points) * 100), 1)
FROM position_totals pt
WHERE c.position = pt.position
  AND c.base_probability = 0
  AND c.seed_points > 0
  AND pt.total_seed_points > 0;

-- Supabase Storage bucket for candidate photos (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-photos', 'candidate-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- REAL CANDIDATES — State Primary Elections (Cycle 3)
-- Run this block to clear sample data and load all candidates.
-- WARNING: also clears predictions.
-- ============================================================

TRUNCATE public.predictions;
DELETE FROM public.candidates;

INSERT INTO public.candidates (name, party, photo, seed_points, position) VALUES
  -- Attorney General
  ('Peter Bedaweed',    'Whig',       '', 0, 'Attorney General'),
  ('Sadie Bush',        'Whig',       '', 0, 'Attorney General'),
  ('Luke Irmer',        'Federalist', '', 0, 'Attorney General'),
  ('Logan Kelley',      'Whig',       '', 0, 'Attorney General'),
  ('Evan Miller',       'Federalist', '', 0, 'Attorney General'),
  ('Steven Montgomery', 'Whig',       '', 0, 'Attorney General'),
  ('Corban Nall',       'Whig',       '', 0, 'Attorney General'),
  ('An Nguyen',         'Federalist', '', 0, 'Attorney General'),
  ('Derek O''Neal',     'Federalist', '', 0, 'Attorney General'),
  ('Tessa Ocegueda',    'Whig',       '', 0, 'Attorney General'),
  ('Lucas Ortiz',       'Federalist', '', 0, 'Attorney General'),
  ('Lucas Roth',        'Federalist', '', 0, 'Attorney General'),
  ('Karlye Stein',      'Federalist', '', 0, 'Attorney General'),
  ('Tyler Woodland',    'Whig',       '', 0, 'Attorney General'),

  -- Controller
  ('Macklin Berg',     'Federalist', '', 0, 'Controller'),
  ('Cyril Botros',     'Federalist', '', 0, 'Controller'),
  ('Walid Garad',      'Federalist', '', 0, 'Controller'),
  ('Danica Giongco',   'Whig',       '', 0, 'Controller'),
  ('Terrence Giusti',  'Federalist', '', 0, 'Controller'),
  ('Simon Gower',      'Whig',       '', 0, 'Controller'),
  ('Zeo Lee',          'Whig',       '', 0, 'Controller'),
  ('Michael Thompson', 'Federalist', '', 0, 'Controller'),

  -- Governor
  ('Lisa Borowik',      'Federalist', '', 0, 'Governor'),
  ('Jeshwin Chettiar',  'Federalist', '', 0, 'Governor'),
  ('Elliot Copen',      'Federalist', '', 0, 'Governor'),
  ('Oscar De Leon',     'Federalist', '', 0, 'Governor'),
  ('Paul Jr. Grazzini', 'Whig',       '', 0, 'Governor'),
  ('John Han',          'Whig',       '', 0, 'Governor'),
  ('Elizabeth Hoffman', 'Whig',       '', 0, 'Governor'),
  ('Leo Le',            'Federalist', '', 0, 'Governor'),
  ('Andrew Metz',       'Whig',       '', 0, 'Governor'),
  ('Emma Quintero',     'Whig',       '', 0, 'Governor'),
  ('Nawid Samim',       'Whig',       '', 0, 'Governor'),
  ('Isabel Shen',       'Whig',       '', 0, 'Governor'),
  ('Nathanael Thomas',  'Whig',       '', 0, 'Governor'),
  ('Chloe Cox',         'Federalist', '', 0, 'Governor'),

  -- Insurance Commissioner
  ('Adam Butler',   'Federalist', '', 0, 'Insurance Commissioner'),
  ('Victor Castan', 'Federalist', '', 0, 'Insurance Commissioner'),
  ('Mateo Gallegos','Whig',       '', 0, 'Insurance Commissioner'),

  -- Lt. Governor
  ('Sebastian Cano Ruvalcaba', 'Whig',       '', 0, 'Lt. Governor'),
  ('Valencia Da Conceicao',    'Whig',       '', 0, 'Lt. Governor'),
  ('Ansh Gosain',              'Federalist', '', 0, 'Lt. Governor'),
  ('Aden Karah',               'Federalist', '', 0, 'Lt. Governor'),
  ('Geo Kim',                  'Federalist', '', 0, 'Lt. Governor'),
  ('Will Latson-Combs',        'Whig',       '', 0, 'Lt. Governor'),
  ('Brandon Le',               'Whig',       '', 0, 'Lt. Governor'),
  ('Carson Maldonado',         'Federalist', '', 0, 'Lt. Governor'),
  ('Krish Parikh',             'Whig',       '', 0, 'Lt. Governor'),
  ('Jinyoung Park',            'Federalist', '', 0, 'Lt. Governor'),
  ('Faisal Rabie',             'Whig',       '', 0, 'Lt. Governor'),
  ('Nick Rashidi',             'Federalist', '', 0, 'Lt. Governor'),
  ('Ronan Soltesz',            'Whig',       '', 0, 'Lt. Governor'),
  ('William Wood',             'Federalist', '', 0, 'Lt. Governor'),
  ('Jamel Sagoe',              'Federalist', '', 0, 'Lt. Governor'),

  -- Secretary of State
  ('Kieran Brown',      'Whig',       '', 0, 'Secretary of State'),
  ('Joaquin Cruz',      'Whig',       '', 0, 'Secretary of State'),
  ('Jeremy Hernandez',  'Whig',       '', 0, 'Secretary of State'),
  ('Julia Lopez',       'Federalist', '', 0, 'Secretary of State'),
  ('Jason Markel',      'Whig',       '', 0, 'Secretary of State'),
  ('Aryan Sharma',      'Federalist', '', 0, 'Secretary of State'),
  ('Saketh Sitaraman',  'Whig',       '', 0, 'Secretary of State'),
  ('Avery Updike',      'Whig',       '', 0, 'Secretary of State'),

  -- State Treasurer
  ('Neil Karia',       'Federalist', '', 0, 'State Treasurer'),
  ('Billi Readinger',  'Whig',       '', 0, 'State Treasurer'),
  ('Theresa Stecher',  'Whig',       '', 0, 'State Treasurer'),
  ('Caroline Yu',      'Federalist', '', 0, 'State Treasurer'),

  -- Superintendent of Public Instruction (nonpartisan)
  ('Sailee Charlu',      'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Ely Franco',         'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Kedaar Garg',        'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Zach Horvitz',       'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Henry Kern',         'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Shouryan Mohammed',  'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Katherine Moreno',   'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Sienna Nocas',       'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Samiya Portugal',    'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Evan Potwora',       'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Carlos Rios',        'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),
  ('Ian Twisselmann',    'Nonpartisan', '', 0, 'Superintendent of Public Instruction'),

  -- Supreme Court Justice (nonpartisan, top 7 win)
  ('Melissa Arriaga',         'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Gio Lenard Borgueta',     'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Jacob Brusca',            'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Pablo Cajas',             'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Casey Carter',            'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Micah Chiang',            'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Rohan Choure',            'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('William Collins',         'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Adrien Conyers',          'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Myles Gonzalez',          'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Lilia Hakobyan',          'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Diego Juarez',            'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Chris Kastoon',           'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Kelly Kaufman',           'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Luphy Ma',                'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Colton McBride',          'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Minna Oshry',             'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Samuel Pareti',           'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Ana Pascale-Gajate',      'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Nikhil Plettner Booker',  'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Emma Rawitz',             'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Zoey Rosen',              'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Madelyn Stroud',          'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Alexander Volk',          'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Gavin Woodard',           'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Nathaniel Yi',            'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Elena Zhang',             'Nonpartisan', '', 0, 'Supreme Court Justice'),
  ('Atticus Zweig',           'Nonpartisan', '', 0, 'Supreme Court Justice')
ON CONFLICT DO NOTHING;

-- Community starter questions
INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who had the best speech?', 'Governor', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who had the best speech?' AND position = 'Governor'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who has the best posters?', 'Governor', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who has the best posters?' AND position = 'Governor'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who has done the best campaigning?', 'Governor', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who has done the best campaigning?' AND position = 'Governor'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who had the best speech?', 'Lt. Governor', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who had the best speech?' AND position = 'Lt. Governor'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who has the best posters?', 'Lt. Governor', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who has the best posters?' AND position = 'Lt. Governor'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who has done the best campaigning?', 'Lt. Governor', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who has done the best campaigning?' AND position = 'Lt. Governor'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who had the best speech?', 'Secretary of State', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who had the best speech?' AND position = 'Secretary of State'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who has the best posters?', 'Secretary of State', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who has the best posters?' AND position = 'Secretary of State'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who has done the best campaigning?', 'Secretary of State', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who has done the best campaigning?' AND position = 'Secretary of State'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who had the best speech?', 'State Treasurer', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who had the best speech?' AND position = 'State Treasurer'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who has the best posters?', 'State Treasurer', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who has the best posters?' AND position = 'State Treasurer'
);

INSERT INTO public.poll_questions (title, position, status, created_by)
SELECT 'Who has done the best campaigning?', 'State Treasurer', 'active', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.poll_questions WHERE title = 'Who has done the best campaigning?' AND position = 'State Treasurer'
);
