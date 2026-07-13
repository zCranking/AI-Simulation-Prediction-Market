-- 0006 — new poll votes reference market_outcomes via outcome_id; the legacy
-- candidate_id column stays for historical rows but is no longer required.
ALTER TABLE public.poll_votes ALTER COLUMN candidate_id DROP NOT NULL;
