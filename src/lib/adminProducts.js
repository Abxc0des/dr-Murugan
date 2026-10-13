import { AdminConfigurationError } from './admin'
import { isSupabaseConfigured } from './config'
import { addSignedImageUrls, productFields } from './products'
import { supabase } from './supabase'

// Administration data service. Every call runs against the existing tables and
// Storage bucket and is subject to the existing RLS / Storage policies. Nothing
// here bypasses authorization: a signed-in non-admin simply receives RLS errors
// (or zero rows), which the UI surfaces as distinct failure states.

const BUCKET = 'product-images'

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const IMAGE_MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const IMAGE_ACCEPT_ATTRIBUTE = Object.keys(IMAGE_MIME_EXTENSIONS).join(',')

function getClient() {
  if (!isSupabaseConfigured || !supabase) throw new AdminConfigurationError()
  return supabase
}

// URL-safe slug matching the products.slug CHECK: lower-case a-z0-9 groups
// separated by single hyphens, with no leading/trailing/double hyphen.
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function validateImageFile(file) {
  if (!file) return null
  if (!IMAGE_MIME_EXTENSIONS[file.type]) return 'Choose a JPEG, PNG, or WebP image.'
  if (file.size > IMAGE_MAX_BYTES) return 'The image must be 5 MB or smaller.'
  return null
}

function uniqueObjectId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Grouped, collision-resistant, extension-validated path: products/<id>/<uuid>.<ext>
export function buildImagePath(productId, file) {
  const extension = IMAGE_MIME_EXTENSIONS[file?.type]
  if (!extension) throw new Error('That image type is not supported.')
  return `products/${productId}/${uniqueObjectId()}.${extension}`
}

export function isSlugConflict(error) {
  return error?.code === '23505' && /slug/i.test(error?.message ?? '')
}

// Maps a thrown error to a user-facing message, keeping authorization failures
// distinct from connectivity failures.
export function describeDataError(error) {
  if (error instanceof AdminConfigurationError) return 'Administration is not connected yet.'
  if (isSlugConflict(error)) return 'That URL slug is already used by another product.'
  const message = String(error?.message ?? '')
  if (error?.code === '42501' || /row-level security|permission denied|violates row-level/i.test(message)) {
    return 'Your account is not allowed to perform this action.'
  }
  if (error?.name === 'AuthSessionMissingError' || error?.code === 'PGRST301') {
    return 'Your session has expired. Sign in again to continue.'
  }
  if (error instanceof TypeError || /failed to fetch|network/i.test(message)) {
    return 'We could not reach the server. Check your connection and try again.'
  }
  return message || 'Something went wrong. Please try again.'
}

export async function getAdminProducts() {
  const { data, error } = await getClient()
    .from('products')
    .select(productFields)
    .order('created_at', { ascending: false })
  if (error) throw error
  return addSignedImageUrls(data)
}

export async function getAdminProductById(id) {
  const { data, error } = await getClient()
    .from('products')
    .select(productFields)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const [product] = await addSignedImageUrls([data])
  return product
}

export async function createProduct(input) {
  const { data, error } = await getClient()
    .from('products')
    .insert(input)
    .select(productFields)
    .single()
  if (error) throw error
  return data
}

// Retries with a short numeric suffix when the generated slug already exists, so
// the owner never has to invent one. Bounded to avoid an endless loop.
export async function createProductWithUniqueSlug(input, attempts = 8) {
  let candidate = { ...input }
  for (let index = 1; index <= attempts; index += 1) {
    try {
      return await createProduct(candidate)
    } catch (error) {
      if (!isSlugConflict(error)) throw error
      candidate = { ...input, slug: `${input.slug}-${index + 1}` }
    }
  }
  throw new Error('A product with this name already exists. Choose a different name.')
}

export async function updateProduct(id, input) {
  const { data, error } = await getClient()
    .from('products')
    .update(input)
    .eq('id', id)
    .select(productFields)
    .single()
  if (error) throw error
  return data
}

export async function deleteProductById(id) {
  const { error } = await getClient().from('products').delete().eq('id', id)
  if (error) throw error
}

export async function uploadProductImage(file, productId) {
  const path = buildImagePath(productId, file)
  const { error } = await getClient().storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw error
  return path
}

export async function removeStorageObjects(paths) {
  const targets = (paths ?? []).filter(Boolean)
  if (targets.length === 0) return
  const { error } = await getClient().storage.from(BUCKET).remove(targets)
  if (error) throw error
}

export async function insertProductImageRow(image) {
  const { data, error } = await getClient()
    .from('product_images')
    .insert(image)
    .select('id, product_id, storage_path, alt_text, position')
    .single()
  if (error) throw error
  return data
}

export async function updateProductImageRow(id, patch) {
  const { error } = await getClient().from('product_images').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteProductImageRow(id) {
  const { error } = await getClient().from('product_images').delete().eq('id', id)
  if (error) throw error
}

export function getPrimaryImage(product) {
  const images = [...(product?.product_images ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return images[0] ?? null
}

// Business rule shared by the admin table: an out-of-stock product that is
// already unavailable cannot be flipped back to available until stock is
// increased (the product form enforces the same rule on save).
export function getProductAvailabilityFlags(product) {
  const outOfStock = product?.stock_quantity === 0
  return { outOfStock, availabilityLocked: outOfStock && !product?.is_available }
}
