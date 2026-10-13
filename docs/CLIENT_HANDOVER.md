# Client handover guide

This guide is for the business owner who will manage the product catalogue after
delivery. It covers day-to-day use of the private admin area and the ownership and
recovery points that must be settled before the owner runs the store alone.

Nothing here requires editing code, and you never need to handle secret keys.

> **Key idea:** signing in is not the same as being an administrator. Only the
> account the site owner added to the admin list can manage products. There is no
> public sign-up.

---

## 1. Sign in to the admin area

1. Go to `/admin` on the website (for example `https://your-site/admin`).
2. Enter the **owner email address** and **password**.
3. If the details are accepted, the dashboard opens.

- There is no "create account" link. Accounts are created deliberately by the
  site owner (see `supabase/ADMIN_BOOTSTRAP.md`).
- If you see **"Access denied"** (with text saying the account is not an
  administrator), you signed in correctly but the account has not been granted
  admin access yet. Ask the site owner to add it.
- If you see **"Could not confirm access"**, that is a temporary connection
  problem. Use **Try again**; you are not being treated as an administrator while
  the check is failing.

## 2. Add a product

1. On the dashboard, choose **Add product**.
2. Fill in the form. Fields marked with `*` are required.
   - **Product name** — required.
   - **URL slug** — filled in automatically from the name; edit it only if you
     want a different web address. Use lower-case letters, numbers and single
     hyphens.
   - **Category** — optional (used for filtering in the shop).
   - **Description** — optional. Do not add health claims, medical benefits,
     ingredients you cannot verify, or approvals you do not hold.
   - **Price** and **Currency** — optional. If you enter a price it must be zero or
     more, with at most two decimal places. Currency is a three-letter code (for
     example `INR`).
   - **Stock quantity** — optional. Leave it blank if you do not track stock. If
     you enter `0`, the product cannot be marked available (see below).
   - **Available for customers** — whether the product should be shown as available.
   - **Featured on the home page** — shows the product in the home page featured row.
   - **Published** — leave this **off** while drafting; turn it on when the product
     is ready for customers.
3. Add a **primary image** (optional but recommended). Choose a JPEG, PNG or WebP
   file up to 5 MB. Add **alternative text** describing the image. A preview
   appears before you save.
4. Choose **Create product**.

A new product starts as a **draft** and is not visible in the shop until you
publish it.

## 3. Add, replace or remove the product image

- **Add / replace:** open the product, choose **Choose image**, pick a valid file,
  then **Save changes**. Replacing an image swaps in the new picture and removes
  the old one.
- **Remove:** open the product and choose **Remove image**, then **Save changes**.
- **Change only the description of the image:** edit the **Alternative text** field
  and save.
- Invalid types and files over 5 MB are rejected before upload, with a message.

The image bucket is private, so images are shown through secure, temporary links;
that is expected and is not a problem.

## 4. Edit a price or description

1. On the dashboard, choose **Edit** next to the product.
2. Change any fields you need. Fields you leave alone are preserved.
3. Choose **Save changes**.

After saving, open the shop to confirm the change is visible (a draft or
unavailable product will not appear).

## 5. Publish or unpublish

- On the dashboard, click the **Published / Draft** badge in the product row to
  toggle it, or use the **Published** checkbox in the edit form.
- **Published + available** = visible in the shop.
- **Draft** or **Unavailable** = hidden from the public catalogue and from direct
  product links.

## 6. Mark a product unavailable

- On the dashboard, click the **Available / Unavailable** badge to toggle it.
- An unavailable product stays in your dashboard but is hidden from customers.
- If a product has `0` stock, it cannot be marked available until you raise the
  stock quantity (or clear it). The edit form blocks this with a message, and the
  dashboard's availability badge is disabled for such a row — so a contradictory
  state cannot be saved from either place.

## 7. Delete a product safely

1. On the dashboard, choose **Delete** next to the product.
2. A confirmation dialog names the product and warns that deletion cannot be
   undone.
3. Confirm to delete the product **and its image**.

Prefer **Unavailable** or **Draft** if you are unsure; deletion is deliberate.

## 8. Recovering from common problems

| Symptom | What to do |
|---|---|
| "Access denied" (account is not an administrator) | The account exists but is not on the admin list. Ask the site owner to add it. |
| "Could not confirm access" | Temporary connection problem. Use **Try again**. |
| "Your session has expired" | Sign in again. |
| Email/password not accepted | Check for typos; passwords are case-sensitive. Do not create a new account — ask the site owner to reset the password. |
| Image rejected | Confirm it is JPEG, PNG or WebP and under 5 MB. |
| "Your account is not allowed to perform this action" | You are signed in but not authorized; ask the site owner to check your admin access. |
| Product not visible in the shop | Check it is both **Published** and **Available**. |

Never share your password, and never paste any key or token into a chat, issue,
email or website field.

---

## 9. Ownership and handover requirements (must be settled by the site owner)

These are organisational steps, not code. They cannot be completed automatically
by whoever built the site.

- **Supabase project ownership.** The Supabase project should ultimately belong to
  the business (its own account/organisation), so the owner controls billing,
  backups and access. Transfer ownership deliberately; do not do it blindly.
- **Admin credentials.** The owner should have their own admin account and control
  the password and its recovery email. Do not share one login between people.
- **Recovery and account management.** Agree who can add or remove administrators,
  how a locked-out owner recovers access, and where the list of admins is kept.
  Administrator access is granted by a row in the database (see
  `supabase/ADMIN_BOOTSTRAP.md`); it is not self-service.
- **Environment variables.** The website needs `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY` and, if used, `VITE_WHATSAPP_NUMBER`. The
  publishable key may live in the browser; the **service-role/secret key must never**
  be placed in the website or any `VITE_` variable. Real values live in `.env.local`,
  which is git-ignored and must never be committed.
- **Legal and regulatory.** Product labelling, permitted claims, shipping, returns
  and privacy pages are currently drafts. The owner must confirm the applicable
  requirements for their business and jurisdiction. **No legal or regulatory
  compliance is claimed here**; verify it with a qualified professional before
  selling. Do not publish health or medical claims that cannot be substantiated.
