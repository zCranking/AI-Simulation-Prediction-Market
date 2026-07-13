-- 0005 — service_role must be able to execute admin RPCs (the default
-- PUBLIC grant was revoked in 0004; service_role was never explicitly
-- granted, so the admin panel's resolve/void calls would be denied).
GRANT EXECUTE ON FUNCTION public.resolve_market(UUID, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_market(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_outcome_probability(UUID) TO service_role;
