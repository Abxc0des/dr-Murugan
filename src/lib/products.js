import { isSupabaseConfigured } from './config'
import { supabase } from './supabase'

export const productFields = `
  id,
  name,
  slug,
  description,
  price,
  currency,
  category,
  stock_quantity,
  is_available,
  is_featured,
  is_published,
  created_at,
  updated_at,
  product_images (id, storage_path, alt_text, position)
`

export class CatalogueConfigurationError extends Error {
  constructor() {
    super('The catalogue is not connected yet.')
    this.name = 'CatalogueConfigurationError'
  }
}

export async function addSignedImageUrls(products) {
  const paths = products.flatMap((product) => product.product_images?.map((image) => image.storage_path) ?? [])

  if (paths.length === 0) return products

  const { data, error } = await supabase.storage.from('product-images').createSignedUrls(paths, 60 * 60)
  if (error) throw error

  const urlsByPath = new Map(data.map((file) => [file.path, file.signedUrl]))
  return products.map((product) => ({
    ...product,
    product_images: [...(product.product_images ?? [])]
      .sort((firstImage, secondImage) => firstImage.position - secondImage.position)
      .map((image) => ({ ...image, signedUrl: urlsByPath.get(image.storage_path) ?? null })),
  }))
}

// The public catalogue must only ever show published AND available products.
// RLS enforces this for anonymous/non-admin sessions, but an authorized admin
// session is granted a separate read policy that returns every row. Filtering
// explicitly here keeps drafts and unavailable products out of the storefront
// for every role, and mirrors the products_public_catalogue_idx partial index.
export async function getPublishedProducts() {
  if (!isSupabaseConfigured) throw new CatalogueConfigurationError()

  const { data, error } = await supabase
    .from('products')
    .select(productFields)
    .eq('is_published', true)
    .eq('is_available', true)
    .order('name')
  if (error) throw error

  return addSignedImageUrls(data)
}

export async function getPublishedProductBySlug(slug) {
  if (!isSupabaseConfigured) throw new CatalogueConfigurationError()

  const { data, error } = await supabase
    .from('products')
    .select(productFields)
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('is_available', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const [product] = await addSignedImageUrls([data])
  return product
}
