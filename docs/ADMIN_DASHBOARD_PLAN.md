# Admin dashboard — implementation plan

**Status:** plan only. Nothing in this document has been built. This is the agreed
design to implement *after* the Supabase migration is applied and the first
administrator is bootstrapped (`supabase/ADMIN_BOOTSTRAP.md`).

**Scope guardrails (do not violate):**

- No customer accounts. Only the business owner signs in.
- No online payment, no Razorpay, no checkout.
- No automated order processing. Customers contact the business over WhatsApp.
- No deployment or hosting work.
- The admin area is private; the public storefront is unchanged.

---

## 1. Data model the dashboard must match

The dashboard is a thin, typed layer over the tables created by
`supabase/migrations/20261011190000_initial_catalogue_schema.sql`. It must not
invent columns.

**`public.products`**

| Column | Type | Notes / constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `name` | text | required, non-blank (`char_length(btrim(name)) > 0`) |
| `slug` | text | required, **unique**, lower-case `a-z0-9-`, no leading/trailing/double hyphen |
| `description` | text | optional |
| `price` | numeric(12,2) | optional; must be ≥ 0 if set |
| `currency` | text | required, 3 UPPERCASE letters, default `INR` |
| `category` | text | optional; non-blank if set |
| `stock_quantity` | integer | optional; ≥ 0 if set |
| `is_available` | boolean | required, default `true` |
| `is_featured` | boolean | required, default `false` |
| `is_published` | boolean | required, default `false` |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()`; **maintained by trigger** |

**`public.product_images`**

| Column | Type | Notes / constraints |
|---|---|---|
| `id` | uuid | PK |
| `product_id` | uuid | FK → `products.id`, `on delete cascade` |
| `storage_path` | text | required, **globally unique**, must not start with `/` |
| `alt_text` | text | required, default `''` |
| `position` | integer | required, ≥ 0; ordering is `position` ascending |
| `created_at` | timestamptz | default `now()` |

**Storage:** bucket `product-images`, **private**, 5 MiB limit, MIME limited to
`image/jpeg`, `image/png`, `image/webp`.

**Existing data service to reuse/extend (do not fork it):**
`src/lib/products.js` exposes `getPublishedProducts()` and
`getPublishedProductBySlug(slug)`, plus `addSignedImageUrls()` which calls
`supabase.storage.from('product-images').createSignedUrls(paths, 3600)`. The shared
`productFields` string and the signed-URL helper should be reused for admin reads so
the field list and URL logic stay in one place. The public pages consume
`product_images[].signedUrl`; keep that contract.

**Field-name rule:** internal code uses the database's `snake_case`
(`is_published`, `stock_quantity`, `storage_path`) exactly as the current
`src/lib/products.js` already does. Do not introduce a camelCase translation layer.

---

## 2. `/admin` login and authorization behavior

- Route: `/admin/*` (already reserved in `src/App.jsx`; currently renders
  `AdminSetupPage`). Replace the placeholder with a guarded admin area.
- **Two separate gates, both required:**
  1. **Authentication** — a valid Supabase session
     (`supabase.auth.getSession()` / `onAuthStateChange`).
  2. **Authorization** — the signed-in user passes the server-side allowlist.
- **Authorization note:** `private.is_authorized_admin()` lives in the `private`
  schema, which is intentionally **not** part of the exposed Data API, so the client
  cannot call it directly (nor should it be exposed). The dashboard therefore proves
  authorization with a real data read that only an admin is permitted: attempt to
  read **draft** products (products where `is_published = false`). A non-admin gets
  zero rows; an admin sees them. Do not try to probe with `admin_users` — it is
  denied to everyone in the browser, including admins, so it cannot distinguish the
  two.
- **Known limitation of the draft probe (do not overstate it):** if the catalogue
  currently has **no draft products at all**, an admin and a non-admin both get zero
  rows, so the probe cannot tell them apart. Do not present the draft probe as a
  definitive check. Treat the result as: rows returned → definitely admin; no rows →
  inconclusive (may be a non-admin, or an admin with no drafts). Because this is a
  **UX gate only**, the safe design is to let an inconclusive session into the shell
  but rely entirely on RLS, which denies every unauthorized read/write at the
  database and surfaces a clear error the UI renders. A definitive client-side
  authorization check requires a server-side signal; if one is wanted later, add a
  tiny `public` wrapper (e.g. a `stable` RPC returning the boolean) rather than
  exposing the `private` schema.
- **Behavior:**
  - No session → show **Sign in** form (email + password via
    `supabase.auth.signInWithPassword`). No public sign-up link.
  - Session present but **not** authorized → show a clear "This account does not have
    administrator access" screen with a **Sign out** action. Do not leak which
    accounts exist.
  - Session present and authorized → render the dashboard shell.
  - Auth failures (bad password, unconfirmed email, too many attempts) show
    non-enumerating messages.
- All admin reads/writes go through the same publishable-key client; RLS enforces
  access. Never use the secret/service-role key in the browser.

## 3. Session persistence and logout

- Persist the session in browser storage via the default Supabase client behavior
  (do not disable it). Session survives reloads/tabs.
- Subscribe to `supabase.auth.onAuthStateChange` to react to sign-in, sign-out, token
  refresh and expiry; on `SIGNED_OUT` or expired session, reset admin state and route
  to the login screen.
- **Logout** button calls `supabase.auth.signOut()` and clears any in-memory admin
  cache/state. Logout must be reachable from every admin screen.
- Note for the operator: for a **remote** admin, revoke access in `admin_users`
  *and* sign out their sessions (see `ADMIN_BOOTSTRAP.md` §5).

## 4. Dashboard overview

Landing screen after sign-in. Read-only summary cards:

- Total products, published count, unpublished/draft count.
- Available vs out-of-stock (`stock_quantity` = 0 or `is_available` = false).
- Featured count.
- Images missing (products with zero `product_images` rows).
- Quick actions: **New product**, **View storefront** (`/shop`), **Sign out**.
- Data comes from an admin-scoped query (RLS returns all rows for an admin),
  aggregated client-side for now. No new database objects required.

## 5. Product list — search, filters, status

- Table/cards listing: thumbnail (first image by `position`), `name`, `slug`,
  `category`, price + currency, availability, featured flag, published status,
  `updated_at`.
- **Search:** client-side match on `name` (and optionally `slug`), reusing the
  pattern already used in `ShopPage` (`toLocaleLowerCase().includes(...)`).
- **Filters:**
  - Category (derived from distinct non-null `category` values).
  - Status: All / Published / Draft (unpublished) / Out of stock / Featured.
- **Sorting:** name, price, `updated_at` (newest first default).
- Pagination or "load more" once the catalogue is large; client-side is fine for
  small catalogues but note the threshold to move to server-side range queries
  (`.range()`).
- Empty, loading and error states are required (see §11).

## 6. Create / edit / preview / publish / unpublish / delete

**Create product**
- Form with all editable fields. On save: `insert` into `products`. Generate a
  default `slug` from `name` (lower-case, non-alphanumerics → single hyphens,
  trim hyphens, ensure uniqueness — handle the unique-violation error by prompting
  for a variant). New products default to `is_published = false` so nothing goes
  live accidentally.
- Validation must mirror the DB checks (required non-blank name; slug regex
  `^[a-z0-9]+(-[a-z0-9]+)*$`; price ≥ 0; 3-letter uppercase currency; stock ≥ 0)
  so users get friendly messages instead of raw constraint errors.

**Edit product**
- `update` by `id`. `updated_at` is set by the database trigger — the client must
  **not** write it.

**Preview**
- Read-only rendering using the same presentational components/formatting as the
  storefront (`formatPrice`, image tiles) so preview matches reality. Confirm the
  public storefront renders the product as intended before publishing. Optionally
  link to `/products/:slug` (note: a draft product will show "unavailable" on the
  public route because of RLS — that is expected; make this clear in the UI).

**Publish / unpublish**
- Toggle `is_published` (and `is_available`) directly from the list and the edit
  form. Confirm before unpublishing a live product.
- Publishing requires at least a `name` and valid `slug`; warn (but do not block) if
  there are no images or no price.

**Delete**
- Confirm dialog showing what will be deleted, including child images.
- Delete the `products` row (cascades to `product_images`) **and** the corresponding
  storage objects (see §13). Prefer "Unpublish" as the default action; deletion is
  deliberate.

## 7. Product fields in the UI

Grouped form:

- **Identity:** `name` (required), `slug` (required, auto-suggested, editable),
  `category` (optional).
- **Details:** `description` (multiline), `price` (optional, ≥ 0), `currency`
  (default `INR`, 3 uppercase letters).
- **Inventory:** `stock_quantity` (optional, ≥ 0), `is_available` (toggle).
- **Visibility:** `is_published` (toggle), `is_featured` (toggle).
- **Images:** managed in §8.

Read-only: `id`, `created_at`, `updated_at`.

## 8. Images — upload, ordering, alt text, replacement, removal

**Upload (multiple)**
- Accept `image/jpeg`, `image/png`, `image/webp` only; enforce ≤ 5 MiB per file on
  the client for good UX (the bucket enforces it server-side too).
- Upload each file to `product-images`, then insert a matching `product_images` row
  with `storage_path` = object path, `alt_text` (default `''`), and `position` =
  next index.
- **Path convention (recommended):** `products/<product_id>/<uuid>.<ext>` — keeps
  objects grouped per product, avoids collisions, and satisfies the
  "must not start with `/`" and global-uniqueness constraints.
- Uploading is only allowed for authorized admins (storage RLS).

**Ordering**
- Drag-and-drop (or move up/down) reorders images by updating `position` (0-based).
- Persist by writing the new `position` values; keep a stable index and avoid
  duplicate positions where possible.

**Alt text**
- Editable per image, saved to `alt_text`. Encourage meaningful text for
  accessibility; default to `"<product name> product image"` in rendering when empty
  (matching `ProductCard`/`ProductPage`).

**Replacement**
- Replace = upload the new object, insert the new `product_images` row (or update it
  to point at the new `storage_path`), then remove the old object. Because
  `storage_path` is globally unique, do not reuse the same path for a different file.

**Removal**
- Delete the `product_images` row **and** the storage object (see §13). Handle the
  "DB row deleted but object remains" and "object deleted but row remains" cases.

**Read-back**
- Admin thumbnails use signed URLs via the existing `addSignedImageUrls()` helper;
  the admin read policy allows signing any object for admin users.

## 9. Stock and availability management

- Quick-edit inline controls in the product list for `is_available` and
  `stock_quantity`.
- Rules: `stock_quantity = 0` should surface as out of stock and suggest setting
  `is_available = false` (do not force it silently). `is_available` is independent
  of `is_published`: a published-but-unavailable product is hidden from the public
  catalogue by the RLS policy (`is_published and is_available`), so warn when both
  would hide a live product.
- Show a clear "hidden from storefront" indicator when a product is published but
  unavailable.

## 10. Featured-product controls

- `is_featured` toggle per product; the storefront shows up to four featured items
  (`HomePage` slices `featuredProducts` to 4).
- Warn when more than four products are featured, since extras will not appear on the
  home page. Optionally show the current featured ordering/allocation.

## 11. Validation, loading, empty, success, error states

- **Validation:** client-side mirror of DB constraints, per-field messages, disable
  submit while invalid, and map any server constraint error (unique slug, check
  violations, FK) to a readable message.
- **Loading:** skeletons/spinners for list, form and uploads; disable actions during
  in-flight mutations.
- **Empty:** distinct messages for "no products yet", "no results for these filters",
  and "no images for this product".
- **Success:** toast/inline confirmation for save/publish/delete/upload; optimistic
  updates are acceptable but must reconcile with the server response.
- **Error:** a reusable error state (existing `CatalogueStates.jsx` already provides
  `LoadingState`/`ErrorState`/`EmptyState` for the storefront — reuse the same visual
  language, or extract shared components rather than duplicating styles). Include a
  retry action for reads.

## 12. Responsive and accessible design

- **Responsive:** mobile-first; the product table becomes stacked cards on small
  screens; the form is single-column on mobile, two-column on desktop; sticky
  save/cancel actions on long forms.
- **Accessible:** semantic landmarks; labelled inputs (`<label>` tied to controls);
  keyboard-operable toggles, menus and drag/reorder controls (provide move up/down
  buttons as a keyboard-accessible alternative to drag-and-drop); visible focus
  states; `aria-live` for success/error toasts; sufficient contrast; no reliance on
  colour alone for status. Reuse the site's existing CSS conventions in
  `src/styles.css` and component patterns from `src/components/`.

## 13. Security boundaries and authorization checks

- **Trust nothing in the client.** Every read/write is enforced by RLS:
  - `products` / `product_images`: public read limited to
    `is_published and is_available`; all mutations require
    `private.is_authorized_admin()`.
  - `storage.objects`: public read limited to objects whose path matches a
    published/available product image; insert/update/delete require an authorized
    admin.
  - `admin_users`: never readable/writable from the browser. The dashboard must not
    attempt "manage admins" UI.
- The client-side admin gate is UX only; a hidden button is not a security control.
- Use only the publishable/anon key in the browser. No secret/service-role key in
  any `VITE_` variable, source file, or bundle.
- Do not add write policies or loosen existing ones to make the dashboard "work".
  If a needed operation is denied, fix the operation, not the policy.
- Keep the corrected `objects.name` predicate intact; do not modify the migration for
  dashboard convenience.
- Consider an authorization re-check (call the admin check again) before sensitive
  actions such as delete, so a revoked admin fails fast.

## 14. Safe image upload constraints

- MIME allowlist: `image/jpeg`, `image/png`, `image/webp` (enforced by the bucket and
  mirrored client-side).
- Max size 5 MiB per file (bucket `file_size_limit = 5242880`).
- Do not trust the file's reported type alone; treat the bucket's enforcement as the
  authority, and reject obvious mismatches client-side.
- Sanitize/derive the stored path from a generated uuid and a validated extension —
  never from raw user filename.
- No SVG (not in the allowlist) to avoid script-in-image risks.
- Upload only into the `product-images` bucket.

## 15. Orphaned storage files and product image rows

Two drift scenarios must be handled deliberately:

1. **DB row exists, storage object missing** → signature/sign fails or image is
   broken. Detect on load; show "image missing" and offer to re-upload or remove the
   row.
2. **Storage object exists, DB row missing** (orphan) → object is invisible to the
   storefront and consumes storage. Provide a maintenance view (admin-only) that
   lists bucket objects for a product and flags ones with no matching
   `product_images.storage_path`, allowing cleanup.

- **Ordering of operations:** upload object → insert DB row (safe default: an orphan
  object is harmless; a row without an object is broken). On delete: remove DB row
  first, then object; if object deletion fails, the leftover is an orphan to be
  cleaned by the maintenance view.
- **Replace:** upload new → repoint/insert row → delete old object.
- Deletions must be confirmed and must cascade consistently (deleting a product
  removes its `product_images` rows via FK cascade; the corresponding storage objects
  must also be enumerated and removed by the app).

## 16. Suggested structure (to follow existing conventions)

```
src/pages/Admin/            # route-level screens (login, dashboard, list, form, preview)
src/lib/admin/              # admin data service (queries + mutations), reusing products.js helpers
src/components/admin/       # admin-only UI (tables, forms, image manager, toasts)
```

Keep storefront files untouched. Reuse `src/lib/supabase.js`, `src/lib/config.js`,
`src/lib/products.js` helpers (field list, signed URLs) and `src/components/CatalogueStates.jsx`
where useful.

---

## 17. Acceptance criteria

- Signed-out visitors to `/admin` see only a sign-in form; no admin data is fetched.
- Signed-in **non-admins** are clearly told they lack access and cannot read drafts
  or perform any mutation (verified by RLS, not just UI).
- Authorized admins can create, edit, preview, publish/unpublish and delete products.
- Product form enforces exactly the database constraints.
- Multiple images can be uploaded, reordered, given alt text, replaced and removed;
  the first-by-`position` image is the storefront thumbnail.
- Stock/availability and featured toggles work and reflect on the storefront.
- Signed URLs are used for all admin thumbnails; no object is publicly readable
  unless its product is published **and** available.
- No secret key appears anywhere in the client bundle.
- Orphan detection handles both drift directions without data loss.
- All screens are responsive and keyboard-accessible.

## 18. Manual testing checklist

**Auth**
- [ ] Signed out → `/admin` shows only sign-in.
- [ ] Wrong password shows a generic error; no account enumeration.
- [ ] Non-admin sign-in → access-denied screen + sign out.
- [ ] Admin sign-in → dashboard; refresh keeps the session; Sign out clears it.

**Products**
- [ ] Create a draft product; it does **not** appear on `/shop`.
- [ ] Validation blocks blank name, bad slug, negative price, bad currency, negative
      stock — with readable messages.
- [ ] Duplicate slug surfaces a friendly error.
- [ ] Edit updates fields; `updated_at` changes; the client never writes it.
- [ ] Publish → appears publicly (`/shop`, `/products/:slug`, home if featured).
- [ ] Unpublish / set unavailable → disappears publicly.
- [ ] Delete a product → its images vanish from the storefront and from storage.

**Images**
- [ ] Upload JPEG/PNG/WebP → appears; thumbnail matches lowest `position`.
- [ ] Reject a disallowed MIME and an oversize file with a clear message.
- [ ] Reorder persists after reload.
- [ ] Alt text saves and improves the rendered `alt`.
- [ ] Replace updates the image and removes the old object.
- [ ] Remove deletes both the row and the object.

**Security (run `supabase/VERIFY_SECURITY.sql` alongside)**
- [ ] Anonymous reads return only published+available products and images.
- [ ] Anonymous/non-admin writes and image uploads are denied.
- [ ] `admin_users` is unreadable/unwritable from the browser.
- [ ] `createSignedUrls` succeeds for public images and admin-only images, and fails
      for an unpublished product's image when requested anonymously.

**Accessibility / responsive**
- [ ] Full keyboard operation of forms, toggles and image reordering.
- [ ] Focus states visible; toasts announced via `aria-live`.
- [ ] Usable down to a narrow mobile width.

---

## 19. Explicitly out of scope

- Customer accounts, profiles, or authentication for shoppers.
- Any payment gateway (Razorpay or otherwise) and checkout.
- Automated order processing, inventory decrement on order, shipping integrations.
- Deployment, hosting, CI/CD.
- Changing the public storefront's behaviour or the applied migration.
