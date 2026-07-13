-- 0007 — advisor findings: the legacy place_prediction RPC (superseded by
-- place_stake) and the handle_new_user trigger function should not be
-- callable via the REST /rpc endpoint.
REVOKE ALL ON FUNCTION public.place_prediction(UUID, INTEGER) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
