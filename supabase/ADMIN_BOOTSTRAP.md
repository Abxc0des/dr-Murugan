# Administrator bootstrap guide

This guide explains, for a beginner, how to grant the **first administrator** access
to the DR.MURUGAN’s flower remedies catalogue. It assumes:

- The migration `supabase/migrations/20261011190000_initial_catalogue_schema.sql`
  has already been applied to the Supabase project.
- You are signed in to the [Supabase dashboard](https://supabase.com/dashboard) as
  the project owner.
- You have **not** committed any secret key to the frontend.

Nothing in this guide creates real accounts, inserts admins, or runs destructive
commands for you. Every identifier below is a placeholder such as
`<YOUR-AUTH-USER-UUID>`. Never paste a real UUID, password, project URL or secret
into this file or into any frontend file.

> **Key idea:** Being signed in is *not* the same as being an administrator.
> An Auth account only proves *who* a person is. Administration is granted separately
> by a row in `public.admin_users` that links to that account’s Auth user id (UUID).

---

## 1. Configure Supabase Auth and create the first admin account

The application intentionally has **no self-service admin sign-up**. Create the
owner’s account deliberately, through the dashboard.

1. In the dashboard, open **Authentication**.
2. Open **Providers** (or **Sign In / Providers**) and make sure the **Email**
   provider is enabled. For a single owner account you do **not** need to enable
   “Allow new users to sign up”; leaving public sign-up disabled is safer, because
   only pre-created accounts can sign in. If your dashboard shows **“Allow new
   users to sign up”**, turn it **off** unless you have a specific reason to allow
   self-registration.
3. Open **Authentication → Users**.
4. Choose **Add user** → **Create new user**.
5. Enter the owner’s **email** and a **strong, unique password**. Use a password
   manager. Do **not** reuse any other password.
6. If the dashboard offers **“Auto Confirm User”**, you may enable it so the account
   can sign in immediately. Otherwise, ask the owner to confirm the email via the
   confirmation link, or use **Send magic link** / **Reset password** afterwards.
7. Save. The account now exists, but it is **not** an administrator yet.

> **Dashboard labels vary.** Depending on the Supabase dashboard version, the menu
> may be called **Authentication → Users**, **Auth → Users**, or the “Users” page
> under an auth section, and the create button may read **Add user**, **Invite user**,
> or **Create new user**. The important outcome is the same: one Auth user with a
> real email and a password.

---

## 2. Retrieve that user’s UUID

The Auth user’s **UUID** (also labelled **UID** or **User UID**) is what links the
account to the admin allowlist.

**Option A — from the dashboard (recommended for beginners):**

1. Go to **Authentication → Users**.
2. Click the user you just created.
3. Find the **User UID** / **UID** field. It looks like
   `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (eight-four-four-four-twelve hexadecimal
   characters).
4. Copy it. This is the only value you need in step 3.

**Option B — from the SQL Editor (read-only lookup):**

```sql
-- Read-only lookup of Auth users. Requires the SQL Editor (postgres role).
-- Inspect the "id" column for the account you created.
select id, email, created_at, email_confirmed_at
from auth.users
order by created_at;
```

> Treat the UUID as an **identifier, not a secret**, but avoid publishing a list of
> admin accounts anywhere public. Never post real project values in issues or chat.

---

## 3. Insert that UUID into `public.admin_users`

Open the **SQL Editor** in the dashboard and run **either** of the following. Pick
the one that matches the value you have.

**3a. If you copied the UUID (Option A above):**

```sql
-- Replace the placeholder with the UUID copied from Authentication → Users.
insert into public.admin_users (user_id)
values ('<YOUR-AUTH-USER-UUID>');
```

**3b. If you prefer to look the account up by email (Option B / avoids copy-paste):**

```sql
-- Replace the placeholder with the admin's email address (lower-cased is safest).
insert into public.admin_users (user_id)
select id
from auth.users
where lower(email) = lower('<ADMIN-EMAIL-ADDRESS>');
```

Notes:

- `admin_users.user_id` is a foreign key to `auth.users(id)`, so the insert fails
  if the UUID does not belong to an existing Auth user. That is intentional.
- The insert must be run from a trusted place (the dashboard SQL Editor, or a
  server process holding the **secret** key). It **cannot** be run from the browser
  app, by design — see section 6.
- You should see `Success. No rows returned` or `1 row inserted`. Nothing else
  needs to change afterwards — there is no cache to refresh.

---

## 4. Verify that the user is authorized

**Check the row exists (SQL Editor):**

```sql
select user_id, created_at
from public.admin_users;
```

You should see exactly the account(s) you intended.

**Prove the authorization function returns `true` for that user.** The SQL Editor
runs as an unrestricted role, so you must temporarily impersonate the signed-in
user to test the check honestly:

```sql
-- Session-scoped simulation. Does NOT change stored data.
begin;
set local role authenticated;
-- Use the SAME UUID you inserted. This becomes auth.uid().
set local request.jwt.claims = '{"sub":"<YOUR-AUTH-USER-UUID>","role":"authenticated"}';
select private.is_authorized_admin() as is_admin;
rollback;
```

Expected result: `true` for an authorized user, `false` for everyone else.
(Run each block separately in the SQL Editor if it complains about transaction
state.)

The same checks appear in `supabase/VERIFY_SECURITY.sql`, which is the canonical
verification script for this project.

---

## 5. Adding another admin, and revoking admin access

**Add another administrator** — create the Auth user (section 1) and then add one row:

```sql
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('<SECOND-ADMIN-EMAIL>');
```

**Revoke admin access** — remove the allowlist row. This immediately removes all
administrative rights, without deleting the person’s account:

```sql
delete from public.admin_users
where user_id = '<THEIR-AUTH-USER-UUID>';
```

**Fully remove a person** — delete the Auth user in **Authentication → Users**
(delete account). The `admin_users` row is removed automatically because the foreign
key uses `on delete cascade`; you do not need a second SQL statement.

> Revoking admin access does **not** sign the person out of an already-open browser
> tab, and a previously issued session may remain valid until it expires or is
> revoked. For immediate cut-off, also sign them out / delete their session from
> **Authentication → Users**. Authorization is re-checked on every request, so their
> very next product or image request is denied as soon as the row is gone.

---

## 6. Why `admin_users` must not be writable by browser clients

`public.admin_users` is the source of truth for “who is an administrator”. If a
browser client could **write** to it, any signed-in person could self-promote:

```sql
-- What we must prevent: a non-admin client inserting itself.
insert into public.admin_users (user_id) values (auth.uid());
```

If a browser client could **read** it, an attacker could enumerate admin accounts
(useful for phishing or targeted password attacks).

The migration prevents both:

- **RLS is enabled with *no* policies** on `admin_users`, and
- table privileges are **revoked** from `anon` and `authenticated`.

No policy means "deny", so browser (anon/authenticated) requests see nothing and
can change nothing. Only the `security definer` function
`private.is_authorized_admin()` — owned by the database owner and therefore able to
read the table — ever consults it. Administrators are added only from a trusted
context (the SQL Editor, or a server-side process with the secret key).

This also means you must **never** add an “insert policy” on `admin_users` so that an
app could “add admins”. Keep administrator management out of the client entirely.

---

## 7. An Auth account alone does not grant admin permissions

Creating an account (or enabling self-service sign-up) only inserts a row into
`auth.users` and lets the person sign in. It does **not** create an `admin_users`
row. Consequently:

- A brand-new signed-in user gets a valid `authenticated` role, but
  `private.is_authorized_admin()` returns `false` for them.
- Every admin write policy (`products`, `product_images`, `storage.objects`) and the
  admin read policies require that function to return `true`.
- So a regular account can only ever see **published and available** products and
  their images — exactly like an anonymous visitor.

**Rule of thumb:** sign-in ≠ admin. Admin = sign-in **plus** an `admin_users` row.

---

## 8. Safe handling of the publishable/anon key vs the service-role/secret key

Supabase exposes two very different classes of API key. The frontend may only ever
hold the first.

| | **Publishable key** (legacy name: **anon** key) | **Service-role key** / **secret** key |
|---|---|---|
| Safe in browser? | **Yes** | **Never** |
| Role it maps to | `anon` (and, once signed in, `authenticated`) | `service_role` |
| Subject to RLS? | **Yes** — every request is policy-checked | **No** — it bypasses RLS entirely |
| Where it belongs | `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (browser) | Dashboard/server env vars only; never any `VITE_` variable |

Supabase is migrating to new key names: the **publishable** key
(`sb_publishable_…`) replaces the anon key, and the **secret** key replaces the
service-role key. The same rule applies to both naming schemes:

- **Publishable / anon key** → fine in `src/` because Row Level Security is enabled
  and enforced for it. This is the whole reason the RLS policies must be correct.
- **Secret / service-role key** → full, unrestricted database access. **Any** leak
  (a `VITE_` variable, a commit, a screenshot, browser devtools) is a total
  compromise. It is only ever used in a trusted server context, and this project
  should not need it at all for the storefront — the storefront only reads.

Additional handling rules:

- Keep real keys in `.env.local`, which is git-ignored. `.env.example` contains only
  placeholders.
- Never log keys, and never paste the secret key into the SQL Editor, an issue, or
  chat.
- If a secret key is ever exposed, **rotate it immediately** in
  **Project Settings → API** (menu name varies).
- Rotating the publishable key requires updating `.env.local` for every environment,
  because the value is embedded at build time.

---

## 9. What to run, start to finish

For a single owner, the whole process is:

1. Create the Auth user (section 1).
2. Copy their UUID, or note their email (section 2).
3. Insert one `admin_users` row (section 3).
4. Verify with `private.is_authorized_admin()` (section 4).
5. Nothing else. Products are added later through the (not-yet-built) admin
   dashboard, or via the SQL Editor if you must, and they must be marked
   `is_published`/`is_available` to appear in the public catalogue.

If any step fails with a **foreign key violation**, the Auth user does not exist yet
(finish section 1). If a dashboard label does not match this guide, search the
dashboard for the closest equivalent — the underlying data (an `auth.users` row and
an `admin_users` row) is what matters.
