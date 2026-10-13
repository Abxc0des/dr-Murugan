-- Initial schema for DR.MURUGAN’s flower remedies.
-- This migration intentionally creates no sample products and no administrator.
-- Add an administrator only after creating their Auth user, using the setup steps.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null unique check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  description text,
  price numeric(12, 2) check (price is null or price >= 0),
  currency text not null default 'INR' check (
    char_length(currency) = 3
    and currency = upper(currency)
  ),
  category text check (category is null or char_length(btrim(category)) > 0),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_available boolean not null default true,
  is_featured boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique check (
    char_length(btrim(storage_path)) > 0
    and left(storage_path, 1) <> '/'
  ),
  alt_text text not null default '',
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

create index products_public_catalogue_idx
  on public.products (name)
  where is_published and is_available;

create index product_images_product_position_idx
  on public.product_images (product_id, position);

create or replace function private.is_authorized_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_authorized_admin() from public;
grant execute on function private.is_authorized_admin() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create trigger products_set_updated_at
before update on public.products
for each row
execute function private.set_updated_at();

-- Anonymous visitors may only read the catalogue.
-- Supabase grants ALL on new public-schema tables to anon/authenticated by default,
-- so RLS alone would leave anon holding unused INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER
-- privileges. Revoke them explicitly so a single missing or mistaken RLS policy can
-- never become a write path, then re-grant the only privilege anon needs.
revoke all on table public.products, public.product_images from anon;
grant select on table public.products, public.product_images to anon;

-- Signed-in users are the only administration candidates. Non-admins keep these
-- privileges but Row Level Security denies every write unless the request also
-- passes private.is_authorized_admin(). Administrators keep full CRUD.
grant select, insert, update, delete on table public.products, public.product_images to authenticated;

-- Row Level Security only governs SELECT/INSERT/UPDATE/DELETE. The remaining
-- table-level privileges (TRUNCATE, REFERENCES, TRIGGER) are NOT filtered by RLS,
-- so an authenticated non-admin could otherwise TRUNCATE the catalogue (or add a
-- trigger / foreign key) despite every policy denying writes. Revoke them from
-- browser roles; administrators still keep full CRUD via the grants above.
revoke truncate, references, trigger on table public.products, public.product_images from anon, authenticated;

-- The admin allowlist must never be readable or writable from a browser client.
-- revoke all also removes any privileges inherited from Supabase default privileges.
revoke all on table public.admin_users from anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;

create policy "Published available products are publicly readable"
on public.products
for select
to anon, authenticated
using (is_published and is_available);

create policy "Authorized administrators can read all products"
on public.products
for select
to authenticated
using ((select private.is_authorized_admin()));

create policy "Authorized administrators can create products"
on public.products
for insert
to authenticated
with check ((select private.is_authorized_admin()));

create policy "Authorized administrators can update products"
on public.products
for update
to authenticated
using ((select private.is_authorized_admin()))
with check ((select private.is_authorized_admin()));

create policy "Authorized administrators can delete products"
on public.products
for delete
to authenticated
using ((select private.is_authorized_admin()));

create policy "Images for published available products are publicly readable"
on public.product_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products
    where products.id = product_images.product_id
      and products.is_published
      and products.is_available
  )
);

create policy "Authorized administrators can read all product images"
on public.product_images
for select
to authenticated
using ((select private.is_authorized_admin()));

create policy "Authorized administrators can create product images"
on public.product_images
for insert
to authenticated
with check ((select private.is_authorized_admin()));

create policy "Authorized administrators can update product images"
on public.product_images
for update
to authenticated
using ((select private.is_authorized_admin()))
with check ((select private.is_authorized_admin()));

create policy "Authorized administrators can delete product images"
on public.product_images
for delete
to authenticated
using ((select private.is_authorized_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Published available product images can be read"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.product_images
    join public.products on products.id = product_images.product_id
    where product_images.storage_path = objects.name
      and products.is_published
      and products.is_available
  )
);

create policy "Authorized administrators can read all product image objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.is_authorized_admin())
);

create policy "Authorized administrators can upload product image objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (select private.is_authorized_admin())
);

create policy "Authorized administrators can update product image objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.is_authorized_admin())
)
with check (
  bucket_id = 'product-images'
  and (select private.is_authorized_admin())
);

create policy "Authorized administrators can delete product image objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (select private.is_authorized_admin())
);
