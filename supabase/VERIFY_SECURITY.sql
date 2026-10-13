-- =============================================================================
-- VERIFY_SECURITY.sql
-- DR.MURUGAN’s flower remedies — post-migration security verification
-- =============================================================================
--
-- PURPOSE
--   Confirm the catalogue schema, grants, RLS policies, storage bucket and
--   admin-allowlist functions match the migrations:
--     supabase/migrations/20261011190000_initial_catalogue_schema.sql
--     supabase/migrations/20261011200000_admin_authorization_rpc.sql
--
-- READ-ONLY GUARANTEE
--   Sections 1–10 are SELECT-only catalog queries and session-scoped read probes.
--   They perform NO INSERT / UPDATE / DELETE / TRUNCATE / DDL and change NO
--   database settings. They run on a FRESH project with no administrator and no
--   products, and they require NO value to be filled in: the only UUID used is the
--   literal all-zero placeholder, which never matches a real account. The
--   authorized-admin path needs a real administrator, so it is exercised only in
--   section 11 on a DISPOSABLE test project (not against production).
--   Section 12 prints a single PASS/FAIL summary.
--
-- WHY THE SQL EDITOR MAY WARN ABOUT "DESTRUCTIVE OPERATIONS"
--   Supabase Studio scans the comment-stripped text with regular expressions for
--   DROP / DELETE / TRUNCATE statements (and UPDATE without WHERE). It is a text
--   scan, not a SQL parser, and it can be fooled by keywords that appear inside
--   STRING LITERALS. In section 12 the assertion labels/notes used to contain the
--   word "EXECUTE" followed, later in the same semicolon-free statement, by the
--   literals 'DELETE' and 'TRUNCATE' — enough to match its pattern even though the
--   script only ever runs SELECTs. The labels and notes are now worded to avoid
--   that false positive.
--   To be explicit: transaction control (`begin` / `rollback`) and role switching
--   (`set local role anon/authenticated` / `reset role`) do NOT trigger it — none of
--   the editor's patterns match those statements. The only trigger was the string
--   literals described above.
--
-- HOW TO RUN
--   Supabase dashboard → SQL Editor → paste ONE section at a time → Run.
--
-- IMPORTANT LIMITATION (do not overstate)
--   Catalog inspection proves that objects EXIST and are CONFIGURED as intended.
--   It does NOT prove a policy is logically correct, that it behaves identically
--   for every role, or that it covers every access path (e.g. the Storage API,
--   PostgREST embedding, or JWT handling). It also cannot prove that the `public`
--   schema is exposed to the Data API (a project setting), which is why
--   public.is_admin() reachability is confirmed at runtime in section 11. Treat
--   these checks as necessary but NOT sufficient; behavioral proof requires the
--   runtime tests in section 11 on a disposable project plus application-level
--   testing. No query here can certify runtime security.
-- =============================================================================


-- =============================================================================
-- [INFO] 1. Tables exist and RLS is enabled
-- =============================================================================
-- INFO (no pass/fail here; see section 12 for the assertion).
-- Expect:
--   rls_enabled = true for public.admin_users, public.products,
--                 public.product_images and storage.objects.
--   rls_forced  = false for all of them.
-- IMPORTANT: admin_users must NOT have RLS forced. The admin check runs inside a
-- SECURITY DEFINER function owned by the table owner; forcing RLS would make the
-- owner itself subject to RLS (and with zero policies, the check would always
-- return false, locking out every administrator). Do not enable FORCE RLS.
select
  n.nspname                   as schema_name,
  c.relname                   as table_name,
  c.relrowsecurity            as rls_enabled,
  c.relforcerowsecurity       as rls_forced,
  pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public'  and c.relname in ('admin_users', 'products', 'product_images'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by schema_name, table_name;


-- =============================================================================
-- [INFO] 2. Expected columns on the catalogue tables
-- =============================================================================
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('products', 'product_images', 'admin_users')
order by table_name, ordinal_position;

-- [INFO] 2b. Keys and constraints that the application relies on
--   Expect: products_slug_key and product_images_storage_path_key (unique),
--           a primary key on each table, and the product_id foreign key that
--           cascades on delete.
select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.products'::regclass, 'public.product_images'::regclass, 'public.admin_users'::regclass)
order by conrelid::regclass::text, conname;


-- =============================================================================
-- [INFO] 3. Trigger and helper functions
-- =============================================================================
-- 3a. The updated_at trigger on public.products
select event_object_schema, event_object_table, trigger_name, action_timing,
       event_manipulation, action_statement
from information_schema.triggers
where trigger_name = 'products_set_updated_at';

-- 3b. Both helper functions in the private schema
--     Expect: is_authorized_admin SECURITY DEFINER with an empty search_path;
--             set_updated_at with an empty search_path.
select
  n.nspname                        as schema_name,
  p.proname                        as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  p.prosecdef                      as security_definer,
  p.proconfig                      as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('is_authorized_admin', 'set_updated_at');

-- 3c. NOTE: for `SET search_path = ''`, PostgreSQL stores proconfig as
--     `search_path=` (or `search_path=""`); both are treated as "empty" below.
--     Empty search_path prevents a SECURITY DEFINER function from resolving
--     objects via a caller-controlled search_path.

-- 3d. Execute privileges on the admin check
--     Expect: anon_can_execute = false, authenticated_can_execute = true.
--     (These raise an error if the function is missing — which is itself a
--     failure; re-run the migration.)
select
  has_function_privilege('anon', 'private.is_authorized_admin()', 'execute')          as anon_can_execute,
  has_function_privilege('authenticated', 'private.is_authorized_admin()', 'execute') as authenticated_can_execute;

-- 3e. INFO: the public authorization RPC used by the admin login gate
--     (migration 20261011200000_admin_authorization_rpc.sql).

-- 3e-i. Configuration of public.is_admin()
--       Expect: zero arguments (no user_id parameter), returns boolean,
--               security_definer = true, and an empty search_path.
select
  n.nspname                        as schema_name,
  p.proname                        as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid)    as returns,
  p.pronargs                       as argument_count,
  p.prosecdef                      as security_definer,
  p.proconfig                      as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_admin';

-- 3e-ii. Execute grants on public.is_admin()
--        Expect: both true. anon must be able to call it so unauthenticated
--        requests receive `false` instead of a permission error.
select
  has_function_privilege('anon', 'public.is_admin()', 'execute')          as anon_can_execute,
  has_function_privilege('authenticated', 'public.is_admin()', 'execute') as authenticated_can_execute;


-- =============================================================================
-- [INFO] 4. Indexes
-- =============================================================================
select schemaname, tablename, indexname, indexdef
from pg_indexes
where indexname in ('products_public_catalogue_idx', 'product_images_product_position_idx');


-- =============================================================================
-- [INFO] 5. Table grants (privileges)
-- =============================================================================
-- Expect:
--   anon          → products SELECT only; product_images SELECT only;
--                   NO rows for admin_users.
--   authenticated → products and product_images SELECT/INSERT/UPDATE/DELETE;
--                   NO rows for admin_users (and no TRUNCATE/REFERENCES/TRIGGER).
-- If anon shows INSERT/UPDATE/DELETE/TRUNCATE here, the migration hardening did
-- not apply — re-check the migration's revoke statements.
--
-- CAVEAT: information_schema.role_table_grants can under-report because it shows
-- only grants visible to the current user's applicable roles. Sections 5d and 12
-- use has_table_privilege(), which is authoritative.
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('admin_users', 'products', 'product_images')
order by table_name, grantee, privilege_type;

-- 5d. Authoritative privilege check via has_table_privilege().
--     Expect: anon = true ONLY for products/product_images SELECT; every other
--     anon value false, and all admin_users values false. authenticated = true for
--     products/product_images CRUD and false for TRUNCATE/REFERENCES/TRIGGER and
--     everything on admin_users. TRUNCATE must be false: RLS does NOT gate it.
select
  has_table_privilege('anon', 'public.products', 'SELECT')              as anon_products_select,
  has_table_privilege('anon', 'public.products', 'INSERT')              as anon_products_insert,
  has_table_privilege('anon', 'public.products', 'UPDATE')              as anon_products_update,
  has_table_privilege('anon', 'public.products', 'DELETE')              as anon_products_delete,
  has_table_privilege('anon', 'public.products', 'TRUNCATE')            as anon_products_truncate,
  has_table_privilege('anon', 'public.product_images', 'SELECT')        as anon_images_select,
  has_table_privilege('anon', 'public.admin_users', 'SELECT')           as anon_admin_select,
  has_table_privilege('authenticated', 'public.products', 'INSERT')       as auth_products_insert,
  has_table_privilege('authenticated', 'public.products', 'TRUNCATE')     as auth_products_truncate,
  has_table_privilege('authenticated', 'public.products', 'TRIGGER')      as auth_products_trigger,
  has_table_privilege('authenticated', 'public.products', 'REFERENCES')   as auth_products_references,
  has_table_privilege('authenticated', 'public.admin_users', 'SELECT')    as auth_admin_select,
  has_table_privilege('authenticated', 'public.admin_users', 'INSERT')    as auth_admin_insert;


-- =============================================================================
-- [INFO] 6. RLS policies
-- =============================================================================
select schemaname, tablename, policyname, cmd, roles, permissive, qual, with_check
from pg_policies
where (schemaname = 'public'  and tablename in ('admin_users', 'products', 'product_images'))
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, cmd, policyname;

-- 6b. The public storage read policy predicate (must qualify objects.name).
--     A bare `name` would bind to products.name inside the subquery and silently
--     deny every image. pg_get_expr formatting is not guaranteed, so the
--     assertion in section 12 treats a non-match as FAIL rather than trusting it.
select policyname, cmd, qual
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'Published available product images can be read';


-- =============================================================================
-- [INFO] 7. Storage bucket 'product-images'
-- =============================================================================
-- Expect: public = false, file_size_limit = 5242880 (5 MiB),
--         allowed_mime_types = {image/jpeg,image/png,image/webp}
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'product-images';


-- =============================================================================
-- [INFO/ASSERTION] 8. Seed-data check (fresh project)
-- =============================================================================
-- On a FRESH project (before bootstrap) both counts must be 0. After you have
-- intentionally added administrators or products these counts change — at that
-- point treat the values as informational, not as failures. Section 12 asserts
-- the fresh-project expectation explicitly.
select
  (select count(*) from public.admin_users)     as admin_rows,
  (select count(*) from public.products)        as product_rows,
  (select count(*) from public.product_images)  as product_image_rows;

-- 8b. If admin_rows > 0, list them with emails for a human sanity check.
--     Emails come from auth.users, readable only in the SQL Editor (postgres).
select a.user_id, u.email, a.created_at
from public.admin_users a
left join auth.users u on u.id = a.user_id
order by a.created_at;


-- =============================================================================
-- [INFO] 9. Storage policies are scoped to the product-images bucket
-- =============================================================================
-- Expect: every storage.objects policy predicate references bucket_id =
-- 'product-images'. A policy without that constraint widens the blast radius.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;


-- =============================================================================
-- [INFO] 10. Session-scoped READ-ONLY role simulation
-- =============================================================================
-- DISTINCTION — privileged editor vs. real client:
--   The SQL Editor connects as the privileged database role (postgres), which
--   bypasses BOTH table privileges and RLS. A privileged session can therefore
--   read admin_users and see drafts. These blocks approximate the real browser
--   path by temporarily assuming the anon / authenticated role and injecting a
--   fake JWT claim, then restoring the original role.
--
-- These blocks are READ-ONLY (SELECT only). Nothing is inserted, updated or
-- deleted. The admin_users DENIAL is verified with a privilege check instead of
-- reading the table, because a direct SELECT as anon raises 42501 and would abort
-- the whole batch. Each block restores the role and ends in ROLLBACK.
--
-- LIMITATIONS OF SQL ROLE SIMULATION (read carefully):
--   * `set local role` reproduces the Postgres role that RLS is enforced against,
--     and the JWT claim GUCs below reproduce auth.uid(). It does NOT reproduce:
--       - the PostgREST/Data API request path (headers, embedding, column grants);
--       - JWT signature, expiry, or audience validation performed by GoTrue;
--       - Storage API authorization for createSignedUrl / upload / delete, which
--         runs through the Storage service and can behave differently from a
--         direct SQL SELECT;
--       - HTTP status/error shapes, rate limiting, CORS, or connection pooling.
--   * `auth.uid()` reads these GUCs; older Supabase versions read
--     `request.jwt.claim.sub` while current versions read `request.jwt.claims`.
--     10b sets BOTH so it works on either build; 10a sets only the plural
--     `request.jwt.claims` and deliberately leaves `request.jwt.claim.sub` UNSET
--     (see the empty-string warning just below).
--   * NEVER set `request.jwt.claim.sub` to the empty string ''. Supabase's shipped
--     `auth.uid()` normally null-guards '' (`nullif(current_setting(...), '')::uuid`),
--     but an `auth.uid()` build can pass the empty value straight to `::uuid`, which
--     raises `22P02 invalid input syntax for type uuid: ""` — as this project did. To
--     mean "no session", leave the GUC UNSET (auth.uid() then returns NULL on every
--     build) or set it to a valid UUID — never to ''.
--   * Setting a role/claim here does NOT grant a real session; it only changes
--     this SQL Editor session.
--
-- The anonymous (10a) and signed-in non-admin (10b) probes below need NO real UUID
-- and run on a fresh project. The authorized-admin path needs a real administrator,
-- so it is NOT run here — see section 11 and supabase/ADMIN_BOOTSTRAP.md.

-- ---- 10a. Anonymous: only published + available products/images are visible -----
begin;
set local role anon;
-- No session: an empty claim set has no "sub", and we deliberately leave
-- request.jwt.claim.sub UNSET (never '') so auth.uid() returns NULL instead of
-- hitting a ::uuid cast on an empty string.
set local request.jwt.claims = '{}';
select count(*) as anon_visible_products from public.products;        -- published+available only
select count(*) as anon_visible_images   from public.product_images;  -- for those products only
select public.is_admin() as anon_is_admin;                            -- EXPECT: false (no session)
-- Safe denial check: do NOT read admin_users here. A direct SELECT would raise
-- 42501 "permission denied" and abort the batch; a false privilege result is
-- exactly why that read is denied. (The read denial itself is also asserted in
-- section 12, branch 15, and exercised at runtime in section 11.)
select has_table_privilege('public.admin_users', 'SELECT') as anon_can_read_admin_users; -- EXPECT: false
-- If this instead shows true, the role switch did not take effect (statements ran
-- outside the transaction as postgres). It does NOT mean anon can read the table.
reset role;
rollback;

-- ---- 10b. Signed-in non-admin: same visibility, and the admin check is false ---
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000000';
select private.is_authorized_admin() as is_admin;                     -- EXPECT: false
select public.is_admin() as is_admin_rpc;                             -- EXPECT: false (same answer via RPC)
select count(*) as visible_products from public.products;             -- published+available only
reset role;
rollback;

-- ---- 10c. Authorized admin: INTENTIONALLY NOT RUN HERE -------------------------
--   Proving the admin path requires a REAL administrator, which a fresh project
--   does not have. Inventing a UUID would only prove that a non-existent user is
--   NOT an admin. Exercise the admin path on a DISPOSABLE test project (section
--   11c) or, after bootstrapping an admin per supabase/ADMIN_BOOTSTRAP.md, sign in
--   as that admin through the app/SDK (a real session) and confirm rpc('is_admin')
--   returns true. Do NOT paste a real admin UUID into this read-only file.

-- NOTE: denied WRITE and denied UPLOAD behavior cannot be proven by read-only
-- probes. Test those in section 11 on a disposable project. (The grants in
-- section 5 already prove at the privilege layer that anon writes are refused.)


-- =============================================================================
-- 11. RUNTIME TESTS — RUN LATER, ON A DISPOSABLE TEST PROJECT ONLY
-- =============================================================================
-- The catalog checks above cannot prove runtime behavior. To prove it, create a
-- THROWAWAY Supabase project, apply the migration there, add ONE test admin and
-- ONE published product (with an image) plus ONE draft product (with an image),
-- then run the tests below. NEVER run destructive tests against real data.
--
-- Use the PUBLISHABLE key and the browser/client SDK (or curl) so the real Data
-- API and Storage API paths are exercised. Use placeholder values only.

-- 11a. Anonymous (publishable key, no session) — expect:
--   * rpc('is_admin')            -> false (no session).
--   * SELECT products            -> only the published AND available product.
--   * SELECT product_images      -> only images of published+available products.
--   * INSERT/UPDATE/DELETE       -> denied (error / 0 rows affected with error).
--   * storage upload to bucket   -> denied.
--   * createSignedUrl(published image)  -> succeeds.
--   * createSignedUrl(draft image)      -> denied/error (RLS at signing time).
--   * GET the object's public URL directly -> 400/403 (bucket is private).

-- 11b. Non-admin authenticated user — expect the same denials as 11a, plus:
--   * rpc('is_admin')            -> false.
--   * Reading draft products     -> returns NO rows.

-- 11c. Authorized admin — expect success:
--   * rpc('is_admin')            -> true.
--   * Reading draft products     -> returns the draft row.
--   * INSERT / UPDATE / DELETE   -> succeed (then clean up the test data).
--   * Upload / replace / delete an image -> succeed.

-- 11d. Revocation — delete the test admin's admin_users row, then repeat 11c:
--   * The very next request is denied (authorization is evaluated per request).

-- 11e. Orphan behavior — delete a product_images row but leave the object:
--   * Signing that object must now fail for the public path (no matching row),
--     confirming the storage policy depends on the DB row.

-- 11f. Authorized admin path (this replaces the old section 10c). The ONLY honest
--   way to test it is with a real administrator on a DISPOSABLE project:
--   * Bootstrap one admin (see supabase/ADMIN_BOOTSTRAP.md).
--   * Sign in as that admin through the app/SDK so the request carries a real JWT,
--     then check rpc('is_admin') -> true and that draft products are readable.
--   Never paste a real admin UUID into this read-only script.

-- Sketch only — replace placeholders; never commit real values:
--   const c = createClient('<URL>', '<PUBLISHABLE_KEY>')
--   await c.from('products').select('*')                       // RLS-filtered
--   await c.from('products').insert({ name: 'x', slug: 'x' })  // expect denial (anon)
--   await c.storage.from('product-images').createSignedUrl('<path>', 3600)


-- =============================================================================
-- [ASSERTIONS] 12. PASS / FAIL SUMMARY
-- =============================================================================
-- One row per check. 'PASS' = matches the intended security configuration;
-- 'FAIL' = mismatch or missing object — investigate before proceeding.
-- Rows whose note says "fresh project only" are expected to change after you
-- intentionally add administrators or products; treat a FAIL there as
-- informational once you have deliberately added data.
-- Reminder: PASS here means the configuration is correct, NOT that runtime
-- security has been proven (see section 11).
-- NOTE: if a required table or function is MISSING, some assertion expressions
-- raise an error instead of printing FAIL — a missing object is itself the
-- failure. (A `to_regclass(...) is not null AND ...` guard would not help, because
-- SQL AND does not short-circuit; a CASE would be needed.)
-- NOTE: the unique-constraint assertion relies on PostgreSQL's default names for
-- inline UNIQUE constraints; a rename is a naming change, not a security failure.
-- NOTE: assertions 1–26 cover the catalogue schema and RLS; assertions 27–31 cover
-- the public.is_admin() RPC from 20261011200000_admin_authorization_rpc.sql.
with checks as (
  select 1 as ord, 'ASSERTION' as kind,
    'All four tables exist with RLS enabled' as check_name,
    (select count(*) = 4
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where (n.nspname = 'public' and c.relname in ('admin_users', 'products', 'product_images') and c.relrowsecurity)
        or (n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity)) as ok,
    'admin_users, products, product_images, storage.objects' as note
  union all
  select 2, 'ASSERTION', 'admin_users RLS is NOT forced',
    (select coalesce(bool_and(not c.relforcerowsecurity), false)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'admin_users'),
    'forcing RLS would break the SECURITY DEFINER admin check'
  union all
  select 3, 'ASSERTION', 'admin_users has zero RLS policies (deny by default)',
    (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'admin_users'),
    'no policy means access is denied'
  union all
  select 4, 'ASSERTION', 'Both helper functions exist in the private schema',
    (select count(*) = 2
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('is_authorized_admin', 'set_updated_at')),
    'is_authorized_admin, set_updated_at'
  union all
  select 5, 'ASSERTION', 'is_authorized_admin is SECURITY DEFINER',
    (select coalesce(bool_and(p.prosecdef), false)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'is_authorized_admin'),
    'required to read the allowlist'
  union all
  select 6, 'ASSERTION', 'is_authorized_admin has an empty search_path',
    (select coalesce(bool_and(
       p.proconfig is not null
       and exists (select 1 from unnest(p.proconfig) cfg where cfg in ('search_path=', 'search_path=""'))
     ), false)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'is_authorized_admin'),
    'prevents caller-controlled search_path'
  union all
  select 7, 'ASSERTION', 'set_updated_at has an empty search_path',
    (select coalesce(bool_and(
       p.proconfig is not null
       and exists (select 1 from unnest(p.proconfig) cfg where cfg in ('search_path=', 'search_path=""'))
     ), false)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'set_updated_at'),
    'trigger function hardening'
  union all
  select 8, 'ASSERTION', 'anon cannot call is_authorized_admin',
    not coalesce((select bool_or(has_function_privilege('anon', p.oid, 'execute'))
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'is_authorized_admin'), true),
    'privilege revoked from public/anon'
  union all
  select 9, 'ASSERTION', 'authenticated can call is_authorized_admin',
    coalesce((select bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'private' and p.proname = 'is_authorized_admin'), false),
    'needed by the admin RLS policies'
  union all
  select 10, 'ASSERTION', 'products updated_at trigger exists',
    (select count(*) = 1 from information_schema.triggers where trigger_name = 'products_set_updated_at'),
    'products_set_updated_at'
  union all
  select 11, 'ASSERTION', 'Expected indexes exist',
    (select count(*) = 2 from pg_indexes
     where indexname in ('products_public_catalogue_idx', 'product_images_product_position_idx')),
    'catalogue + image ordering indexes'
  union all
  select 12, 'ASSERTION', 'Unique constraints on slug and storage_path exist',
    (select count(*) = 2 from pg_constraint
     where contype = 'u' and conname in ('products_slug_key', 'product_images_storage_path_key')),
    'products_slug_key, product_images_storage_path_key'
  union all
  select 13, 'ASSERTION', 'anon holds SELECT on products and product_images',
    has_table_privilege('anon', 'public.products', 'SELECT')
      and has_table_privilege('anon', 'public.product_images', 'SELECT'),
    'public catalogue reads'
  union all
  select 14, 'ASSERTION', 'anon holds NO write/TRUNCATE/REFERENCES/TRIGGER on catalogue tables',
    not exists (
      select 1
      from (values ('public.products'), ('public.product_images')) as t(tbl)
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
      where has_table_privilege('anon', t.tbl, p.priv)
    ),
    'revoked at the privilege layer'
  union all
  select 15, 'ASSERTION', 'anon holds NO privilege on admin_users',
    not exists (
      select 1
      from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
      where has_table_privilege('anon', 'public.admin_users', p.priv)
    ),
    'allowlist is not browser-readable'
  union all
  select 16, 'ASSERTION', 'authenticated holds INSERT/UPDATE/DELETE on catalogue tables',
    not exists (
      select 1
      from (values ('public.products'), ('public.product_images')) as t(tbl)
      cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
      where not has_table_privilege('authenticated', t.tbl, p.priv)
    ),
    'needed for administrator CRUD (RLS still gates)'
  union all
  select 17, 'ASSERTION', 'authenticated holds NO TRUNCATE/REFERENCES/TRIGGER on catalogue tables',
    not exists (
      select 1
      from (values ('public.products'), ('public.product_images')) as t(tbl)
      cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
      where has_table_privilege('authenticated', t.tbl, p.priv)
    ),
    'RLS does not gate these; they must be revoked'
  union all
  select 18, 'ASSERTION', 'authenticated holds NO privilege on admin_users',
    not exists (
      select 1
      from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
      where has_table_privilege('authenticated', 'public.admin_users', p.priv)
    ),
    'allowlist is not browser-readable'
  union all
  select 19, 'ASSERTION', 'Exactly 10 policies on products + product_images (detects unexpected policies)',
    (select count(*) = 10 from pg_policies where schemaname = 'public' and tablename in ('products', 'product_images')),
    '5 per table (public select + 4 admin)'
  union all
  select 20, 'ASSERTION', 'Exactly 5 policies on storage.objects (detects unexpected policies)',
    (select count(*) = 5 from pg_policies where schemaname = 'storage' and tablename = 'objects'),
    'public select + 4 admin'
  union all
  select 21, 'ASSERTION', 'Bucket product-images is private with expected size and MIME types',
    coalesce((select (b.public = false
                      and b.file_size_limit = 5242880
                      and coalesce(b.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[], false)
                      and coalesce(b.allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp']::text[], false))
              from storage.buckets b where b.id = 'product-images'), false),
    'private, 5242880 bytes, jpeg/png/webp'
  union all
  select 22, 'ASSERTION', 'Public storage read policy references objects.name',
    coalesce((select bool_and(qual like '%objects.name%')
              from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and policyname = 'Published available product images can be read'), false),
    'must not be a bare name'
  union all
  select 23, 'ASSERTION', 'All storage.objects policies are scoped to product-images',
    coalesce((select bool_and((coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%product-images%')
              from pg_policies
              where schemaname = 'storage' and tablename = 'objects'), false),
    'no policy targets other buckets'
  union all
  select 24, 'ASSERTION', 'No administrators seeded',
    (select count(*) = 0 from public.admin_users),
    'fresh project only; expect > 0 after bootstrap'
  union all
  select 25, 'ASSERTION', 'No products seeded',
    (select count(*) = 0 from public.products),
    'fresh project only; expect > 0 after adding products'
  union all
  -- The VALUES list below is a MANUAL MIRROR of the policy names in the migration.
  -- Update it whenever a policy is added, renamed or removed, or this check drifts.
  -- Branch 26 catches missing/renamed policies; branches 19/20 catch extras.
  select 26, 'ASSERTION', 'All 15 expected policy names exist (by name, not just count)',
    not exists (
      select 1
      from (values
        ('public',  'products',       'Published available products are publicly readable'),
        ('public',  'products',       'Authorized administrators can read all products'),
        ('public',  'products',       'Authorized administrators can create products'),
        ('public',  'products',       'Authorized administrators can update products'),
        ('public',  'products',       'Authorized administrators can delete products'),
        ('public',  'product_images', 'Images for published available products are publicly readable'),
        ('public',  'product_images', 'Authorized administrators can read all product images'),
        ('public',  'product_images', 'Authorized administrators can create product images'),
        ('public',  'product_images', 'Authorized administrators can update product images'),
        ('public',  'product_images', 'Authorized administrators can delete product images'),
        ('storage', 'objects',        'Published available product images can be read'),
        ('storage', 'objects',        'Authorized administrators can read all product image objects'),
        ('storage', 'objects',        'Authorized administrators can upload product image objects'),
        ('storage', 'objects',        'Authorized administrators can update product image objects'),
        ('storage', 'objects',        'Authorized administrators can delete product image objects')
      ) as expected(schema_name, table_name, policy_name)
      where not exists (
        select 1 from pg_policies pp
        where pp.schemaname = expected.schema_name
          and pp.tablename  = expected.table_name
          and pp.policyname::text = expected.policy_name
      )
    ),
    'catches a missing/renamed policy even when the count still matches'
  union all
  select 27, 'ASSERTION', 'public.is_admin() exists in the exposed schema with zero arguments returning boolean',
    (select count(*) = 1
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_admin'
       and p.pronargs = 0 and p.prorettype = 'boolean'::regtype),
    'no user_id parameter: a caller cannot ask about another user'
  union all
  select 28, 'ASSERTION', 'public.is_admin is SECURITY DEFINER',
    (select coalesce(bool_and(p.prosecdef), false)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_admin'),
    'lets it read the allowlist that browser roles cannot'
  union all
  select 29, 'ASSERTION', 'public.is_admin has an empty search_path',
    (select coalesce(bool_and(
       p.proconfig is not null
       and exists (select 1 from unnest(p.proconfig) cfg where cfg in ('search_path=', 'search_path=""'))
     ), false)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_admin'),
    'prevents caller-controlled search_path'
  union all
  select 30, 'ASSERTION', 'anon can call public.is_admin',
    coalesce((select bool_and(has_function_privilege('anon', p.oid, 'execute'))
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'is_admin'), false),
    'unauthenticated callers get false, not a permission error'
  union all
  select 31, 'ASSERTION', 'authenticated can call public.is_admin',
    coalesce((select bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'is_admin'), false),
    'the admin login gate depends on it'
)
select
  ord,
  kind,
  case when ok then 'PASS' else 'FAIL' end as status,
  check_name,
  note
from checks
order by ord;

-- =============================================================================
-- END OF VERIFICATION SCRIPT
-- =============================================================================
