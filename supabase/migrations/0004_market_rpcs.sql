-- ============================================================
-- 0004 — MARKET RPCs
--
--   compute_outcome_probability(outcome) — server-side probability
--   place_stake(outcome, points)         — atomic, race-free staking
--   resolve_market(market, winners[])    — resolution + payouts
--   void_market(market)                  — cancel + refund stakes
--   get_leaderboard_v2()                 — humans + AI Analyst, Brier-ranked
--
-- place_stake replaces the legacy place_prediction, which ignored
-- the requested stake (hardcoded 1 point) and never deducted
-- points_remaining.
-- ============================================================

-- Crowd probability with Bayesian smoothing: the admin-set
-- base_probability (or a uniform prior when unset) acts as 100
-- virtual points, so early markets aren't whipsawed by the first
-- few stakes and converge to the true stake share as volume grows.
-- Mirrors computeOutcomeProbability in src/lib/market.ts — keep in sync.
CREATE OR REPLACE FUNCTION public.compute_outcome_probability(p_outcome_id UUID)
RETURNS DOUBLE PRECISION
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  WITH race AS (
    SELECT
      o.id,
      o.total_points,
      o.base_probability,
      COUNT(*) OVER () AS n,
      SUM(o.total_points) OVER () AS race_total
    FROM public.market_outcomes o
    WHERE o.market_id = (SELECT market_id FROM public.market_outcomes WHERE id = p_outcome_id)
  )
  SELECT ROUND((
    (
      (CASE WHEN base_probability > 0 THEN base_probability ELSE 100.0 / n END)
      + total_points
    ) / (100.0 + race_total) * 100.0
  )::NUMERIC, 1)::DOUBLE PRECISION
  FROM race
  WHERE id = p_outcome_id;
$$;

REVOKE ALL ON FUNCTION public.compute_outcome_probability(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.compute_outcome_probability(UUID) TO authenticated;

-- ── place_stake ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_stake(
  p_outcome_id UUID,
  p_points INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_market_id UUID;
  v_market_status TEXT;
  v_balance INTEGER;
  v_probability DOUBLE PRECISION;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Stake must be a positive number of points');
  END IF;

  SELECT m.id, m.status INTO v_market_id, v_market_status
  FROM public.market_outcomes o
  JOIN public.markets m ON m.id = o.market_id
  WHERE o.id = p_outcome_id;

  IF v_market_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Outcome not found');
  END IF;
  IF v_market_status <> 'active' THEN
    RETURN json_build_object('success', false, 'message', 'This market is not open for staking');
  END IF;

  -- Atomic check-and-deduct: the WHERE guard is evaluated under the
  -- row lock the UPDATE itself takes, so two concurrent calls cannot
  -- both spend a balance that only covers one of them.
  UPDATE public.users
  SET points_remaining = points_remaining - p_points
  WHERE id = v_user_id AND points_remaining >= p_points
  RETURNING points_remaining INTO v_balance;

  IF v_balance IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Insufficient points');
  END IF;

  -- Snapshot the probability BEFORE this stake moves the market
  v_probability := public.compute_outcome_probability(p_outcome_id);

  INSERT INTO public.stakes (user_id, market_id, outcome_id, points_staked, probability_at_stake)
  VALUES (v_user_id, v_market_id, p_outcome_id, p_points, COALESCE(v_probability, 0));

  UPDATE public.market_outcomes
  SET total_points = total_points + p_points
  WHERE id = p_outcome_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Stake placed',
    'balance_remaining', v_balance,
    'probability_at_stake', v_probability
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_stake(UUID, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.place_stake(UUID, INTEGER) TO authenticated;

-- ── resolve_market ──────────────────────────────────────────
-- Admin-only (service role): stamps winners, pays out winning
-- stakes at multiplier min(100 / probability_at_stake, 6) —
-- the long-shot payout curve, capped so it can't explode.
CREATE OR REPLACE FUNCTION public.resolve_market(
  p_market_id UUID,
  p_winner_outcome_ids UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_winners_count INTEGER;
  v_valid_winner_count INTEGER;
  v_paid_stakes INTEGER := 0;
BEGIN
  SELECT status, winners_count INTO v_status, v_winners_count
  FROM public.markets WHERE id = p_market_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Market not found');
  END IF;
  IF v_status = 'resolved' THEN
    RETURN json_build_object('success', false, 'message', 'Market is already resolved');
  END IF;

  SELECT COUNT(*) INTO v_valid_winner_count
  FROM public.market_outcomes
  WHERE market_id = p_market_id AND id = ANY(p_winner_outcome_ids);

  IF v_valid_winner_count <> COALESCE(array_length(p_winner_outcome_ids, 1), 0)
     OR v_valid_winner_count = 0 THEN
    RETURN json_build_object('success', false, 'message', 'Winner outcomes must belong to this market');
  END IF;
  IF v_valid_winner_count <> v_winners_count THEN
    RETURN json_build_object('success', false, 'message',
      format('This market requires exactly %s winner(s)', v_winners_count));
  END IF;

  UPDATE public.market_outcomes
  SET is_winner = (id = ANY(p_winner_outcome_ids))
  WHERE market_id = p_market_id;

  -- Pay out winning stakes
  WITH payouts AS (
    SELECT
      s.user_id,
      SUM(FLOOR(s.points_staked * LEAST(100.0 / GREATEST(s.probability_at_stake, 1.0), 6.0)))::INTEGER AS payout
    FROM public.stakes s
    WHERE s.market_id = p_market_id AND s.outcome_id = ANY(p_winner_outcome_ids)
    GROUP BY s.user_id
  )
  UPDATE public.users u
  SET points_remaining = u.points_remaining + payouts.payout
  FROM payouts
  WHERE u.id = payouts.user_id;

  GET DIAGNOSTICS v_paid_stakes = ROW_COUNT;

  UPDATE public.markets
  SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
  WHERE id = p_market_id;

  RETURN json_build_object('success', true, 'message', 'Market resolved', 'users_paid', v_paid_stakes);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_market(UUID, UUID[]) FROM anon, authenticated, public;

-- ── void_market ─────────────────────────────────────────────
-- Admin-only (service role): cancels a market and refunds every
-- stake at face value.
CREATE OR REPLACE FUNCTION public.void_market(p_market_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.markets WHERE id = p_market_id;

  IF v_status IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Market not found');
  END IF;
  IF v_status IN ('resolved', 'voided') THEN
    RETURN json_build_object('success', false, 'message', 'Market is already closed');
  END IF;

  WITH refunds AS (
    SELECT user_id, SUM(points_staked)::INTEGER AS refund
    FROM public.stakes
    WHERE market_id = p_market_id
    GROUP BY user_id
  )
  UPDATE public.users u
  SET points_remaining = u.points_remaining + refunds.refund
  FROM refunds
  WHERE u.id = refunds.user_id;

  UPDATE public.markets
  SET status = 'voided', resolved_at = NOW(), updated_at = NOW()
  WHERE id = p_market_id;

  RETURN json_build_object('success', true, 'message', 'Market voided and stakes refunded');
END;
$$;

REVOKE ALL ON FUNCTION public.void_market(UUID) FROM anon, authenticated, public;

-- ── get_leaderboard_v2 ──────────────────────────────────────
-- Humans scored on their stakes, the AI Analyst scored on its
-- latest pre-resolution forecast per outcome — one ranked table.
-- Lower Brier score = more accurate.
CREATE OR REPLACE FUNCTION public.get_leaderboard_v2()
RETURNS TABLE (
  participant_type TEXT,
  id UUID,
  name TEXT,
  points_remaining INTEGER,
  prediction_count BIGINT,
  brier_score DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    'user'::TEXT AS participant_type,
    u.id,
    u.name,
    u.points_remaining,
    COUNT(s.id) AS prediction_count,
    CASE
      WHEN COUNT(s.id) FILTER (WHERE m.status = 'resolved') > 0 THEN
        AVG(
          POWER(
            s.probability_at_stake / 100.0 -
            CASE WHEN o.is_winner THEN 1.0 ELSE 0.0 END,
            2
          )
        ) FILTER (WHERE m.status = 'resolved')
      ELSE NULL
    END AS brier_score
  FROM public.users u
  LEFT JOIN public.stakes s ON s.user_id = u.id
  LEFT JOIN public.markets m ON m.id = s.market_id
  LEFT JOIN public.market_outcomes o ON o.id = s.outcome_id
  GROUP BY u.id, u.name, u.points_remaining

  UNION ALL

  SELECT
    'ai'::TEXT,
    NULL::UUID,
    'AI Analyst'::TEXT,
    NULL::INTEGER,
    (SELECT COUNT(DISTINCT f2.market_id) FROM public.ai_forecasts f2),
    AVG(POWER(lf.probability / 100.0 - CASE WHEN o.is_winner THEN 1.0 ELSE 0.0 END, 2))
  FROM (
    SELECT DISTINCT ON (f.market_id, f.outcome_id) f.outcome_id, f.probability
    FROM public.ai_forecasts f
    JOIN public.markets m ON m.id = f.market_id
    WHERE m.status = 'resolved'
      AND f.created_at <= COALESCE(m.resolved_at, NOW())
    ORDER BY f.market_id, f.outcome_id, f.created_at DESC
  ) lf
  JOIN public.market_outcomes o ON o.id = lf.outcome_id
  HAVING (SELECT COUNT(*) FROM public.ai_forecasts) > 0;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard_v2() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_v2() TO authenticated;
