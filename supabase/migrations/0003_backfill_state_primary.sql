-- ============================================================
-- 0003 — BACKFILL: legacy single-election data → multi-market
--
-- Idempotent (safe to re-run): every insert is keyed on a natural
-- unique key with ON CONFLICT DO NOTHING or a NOT EXISTS guard.
--
-- Maps:
--   candidates.position (distinct)  → one markets row each,
--                                      grouped under 'state-primary'
--   candidates                      → market_outcomes
--   predictions                     → stakes (empty in prod today)
--   poll_questions.position        → poll_questions.market_id
--   poll_votes.candidate_id        → poll_votes.outcome_id
--
-- Legacy tables are left intact until the app cutover is verified.
-- ============================================================

-- Repoint poll tables (dual columns; legacy columns dropped later)
ALTER TABLE public.poll_questions
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE;
ALTER TABLE public.poll_votes
  ADD COLUMN IF NOT EXISTS outcome_id UUID REFERENCES public.market_outcomes(id) ON DELETE CASCADE;

-- 1. Group
INSERT INTO public.market_groups (slug, title, description)
VALUES (
  'state-primary',
  'State Primary Elections',
  'Cycle 3 state primary. One market per race — predict the winner of each position.'
)
ON CONFLICT (slug) DO NOTHING;

-- 2. One market per distinct candidate position
INSERT INTO public.markets (group_id, slug, title, description, market_type, winners_count, status)
SELECT
  g.id,
  trim(BOTH '-' FROM lower(regexp_replace(pos.position, '[^a-zA-Z0-9]+', '-', 'g'))),
  pos.position,
  'Who will win ' || pos.position || ' in the State Primary?',
  CASE WHEN pos.position = 'Supreme Court Justice' THEN 'multi_winner' ELSE 'single_winner' END,
  CASE WHEN pos.position = 'Supreme Court Justice' THEN 7 ELSE 1 END,
  CASE
    WHEN (SELECT status FROM public.election_settings WHERE id = 1) = 'resolved' THEN 'resolved'
    ELSE 'active'
  END
FROM (SELECT DISTINCT position FROM public.candidates WHERE position <> '') pos
CROSS JOIN (SELECT id FROM public.market_groups WHERE slug = 'state-primary') g
ON CONFLICT (slug) DO NOTHING;

-- 3. Candidates → outcomes (keyed on market + label)
INSERT INTO public.market_outcomes (market_id, label, party, photo_url, base_probability)
SELECT m.id, c.name, c.party, c.photo, c.base_probability
FROM public.candidates c
JOIN public.markets m ON m.title = c.position
ON CONFLICT (market_id, label) DO NOTHING;

-- 4. Predictions → stakes (prod has zero rows today; kept for completeness)
INSERT INTO public.stakes (user_id, market_id, outcome_id, points_staked, probability_at_stake, created_at)
SELECT p.user_id, o.market_id, o.id, p.points_allocated, p.probability_at_prediction, p.created_at
FROM public.predictions p
JOIN public.candidates c ON c.id = p.candidate_id
JOIN public.markets m ON m.title = c.position
JOIN public.market_outcomes o ON o.market_id = m.id AND o.label = c.name
WHERE NOT EXISTS (
  SELECT 1 FROM public.stakes s
  WHERE s.user_id = p.user_id AND s.outcome_id = o.id AND s.created_at = p.created_at
);

-- 5. Sync aggregate totals from whatever stakes now exist
UPDATE public.market_outcomes o
SET total_points = agg.total
FROM (
  SELECT outcome_id, SUM(points_staked) AS total
  FROM public.stakes
  GROUP BY outcome_id
) agg
WHERE agg.outcome_id = o.id AND o.total_points <> agg.total;

-- 6. Repoint poll questions and votes
UPDATE public.poll_questions q
SET market_id = m.id
FROM public.markets m
WHERE q.market_id IS NULL AND m.title = q.position;

UPDATE public.poll_votes v
SET outcome_id = o.id
FROM public.candidates c
JOIN public.markets m ON m.title = c.position
JOIN public.market_outcomes o ON o.market_id = m.id AND o.label = c.name
WHERE v.outcome_id IS NULL AND c.id = v.candidate_id;
