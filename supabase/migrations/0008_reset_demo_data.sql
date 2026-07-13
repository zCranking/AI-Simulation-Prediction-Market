-- 0008 — reset the demo to a clean slate before showcasing publicly.
-- Wipes user-generated activity (stakes, poll votes, AI forecasts) and
-- anonymizes tester display names picked up during development. Market
-- structure (markets/market_outcomes/poll_questions) is untouched — only
-- their accumulated volume/tallies reset to zero.

DELETE FROM public.stakes;
DELETE FROM public.poll_votes;
DELETE FROM public.ai_forecasts;

UPDATE public.market_outcomes SET total_points = 0, is_winner = NULL;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS n
  FROM public.users
)
UPDATE public.users u
SET name = 'Demo Trader ' || numbered.n,
    points_remaining = 1000
FROM numbered
WHERE u.id = numbered.id;
