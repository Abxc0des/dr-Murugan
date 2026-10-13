# DR.MURUGAN’s flower remedies

A React catalogue application for owner-managed products and WhatsApp enquiries. It intentionally contains no sample products, payment flow, customer accounts, or deployment configuration.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Leave the values blank until Supabase and the business WhatsApp number are verified.
3. Run `npm install`.
4. Run `npm run dev` and open the local URL shown by Vite.
5. Run `npm run build` to create a production build locally.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are browser-visible values. They are safe only when the Supabase Row Level Security policies in this project are enabled. Never add a Supabase service-role key, database password, or owner password to any `VITE_` variable or frontend file.

## Current status

The storefront is ready to read published products from Supabase after the database and storage setup. `/admin` is intentionally a setup page until Supabase authentication and the administrator allowlist are configured.
