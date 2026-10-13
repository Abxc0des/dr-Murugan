-- Minimal, reviewed authorization RPC for the admin dashboard login gate.
--
-- This migration is ADDITIVE. It does not change any table, column, RLS policy,
-- grant, trigger, bucket or the existing private.is_authorized_admin() logic.
-- The existing table and storage policies remain the only enforcement point for
-- reads and writes; this function is used solely as a client-side UX gate.
--
-- Why this function exists:
--   private.is_authorized_admin() lives in the `private` schema, which is not part
--   of the exposed Data API, so the browser cannot call it. This wrapper lets the
--   dashboard ask "is the CURRENT user an administrator?" without exposing the
--   private schema or the allowlist.
--
-- Why it is safe:
--   * It takes NO parameters, so a caller cannot ask about another user.
--   * The answer comes only from auth.uid() — the verified identity in the request
--     JWT — never from caller-supplied input.
--   * SECURITY DEFINER lets it read public.admin_users (which browser roles cannot),
--     and `set search_path = ''` prevents any caller-controlled search_path from
--     redirecting the objects it resolves.
--   * It returns ONLY a boolean. It never returns admin UUIDs, email addresses,
--     row counts, or any other part of the allowlist.
--   * Execute is granted to anon and authenticated so an unauthenticated caller
--     receives `false` instead of an error; the boolean leaks nothing either way.
--   * It authorizes NOTHING on its own. It cannot read products, read images, or
--     perform any write. Those remain governed by the existing RLS policies, which
--     independently re-check private.is_authorized_admin() for every request.
--
-- Note: auth.uid() returns null when there is no valid session, so the underlying
-- allowlist check evaluates to false for unauthenticated callers.
-- Dependency: this RPC delegates to private.is_authorized_admin(). If that
-- function is renamed or its signature changes, this migration must be updated.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Delegate to the single existing source of truth so the allowlist check is
  -- defined in exactly one place. Both functions are SECURITY DEFINER owned by
  -- the database owner, and the inner call still resolves auth.uid() itself.
  select private.is_authorized_admin();
$$;

-- Replace any default PUBLIC execute grant, then grant only to the two API roles.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
