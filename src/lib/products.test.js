import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Unit tests for products.js. The Supabase module is replaced with an in-memory
// fake: signed URLs, catalogue queries and error paths are all exercised without
// any network traffic or real project data.

const supa = vi.hoisted(() => ({
  from: vi.fn(),
  createSignedUrls: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args) => supa.from(...args),
    storage: {
      from: (bucket) => {
        supa.storageBucket = bucket
        return { createSignedUrls: (...args) => supa.createSignedUrls(...args) }
      },
    },
  },
}))

async function loadProducts(env = {}) {
  vi.stubEnv('VITE_SUPABASE_URL', env.url ?? 'https://example.supabase.test')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', env.key ?? 'test-publishable-key')
  vi.stubEnv('VITE_WHATSAPP_NUMBER', '')
  vi.resetModules()
  return import('./products')
}

let catalogue
beforeEach(async () => {
  supa.from.mockReset()
  supa.createSignedUrls.mockReset()
  supa.storageBucket = undefined
  catalogue = await loadProducts()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('addSignedImageUrls', () => {
  const products = [
    {
      id: 'p1',
      name: 'Rose Water',
      product_images: [
        { id: 'img2', storage_path: 'products/p1/b.webp', alt_text: 'Blue bottle', position: 1 },
        { id: 'img1', storage_path: 'products/p1/a.jpg', alt_text: 'Pink rose', position: 0 },
      ],
    },
    { id: 'p2', name: 'Jasmine', product_images: [] },
    { id: 'p3', name: 'Lavender', product_images: null },
  ]

  it('signs every storage path, sorts images by position and attaches the URLs', async () => {
    supa.createSignedUrls.mockResolvedValue({
      data: [
        { path: 'products/p1/a.jpg', signedUrl: 'https://signed.test/a.jpg' },
        { path: 'products/p1/b.webp', signedUrl: 'https://signed.test/b.webp' },
      ],
      error: null,
    })

    const result = await catalogue.addSignedImageUrls(products)

    expect(supa.storageBucket).toBe('product-images')
    expect(supa.createSignedUrls).toHaveBeenCalledWith(
      ['products/p1/b.webp', 'products/p1/a.jpg'],
      60 * 60,
    )

    // Product order is preserved and empty/null image lists are normalised.
    expect(result.map((product) => product.id)).toEqual(['p1', 'p2', 'p3'])
    expect(result[0].product_images.map((image) => image.id)).toEqual(['img1', 'img2'])
    expect(result[0].product_images[0]).toEqual({
      id: 'img1',
      storage_path: 'products/p1/a.jpg',
      alt_text: 'Pink rose',
      position: 0,
      signedUrl: 'https://signed.test/a.jpg',
    })
    expect(result[1].product_images).toEqual([])
    expect(result[2].product_images).toEqual([])
  })

  it('leaves signedUrl null when Storage does not return a path', async () => {
    supa.createSignedUrls.mockResolvedValue({
      data: [{ path: 'products/p1/a.jpg', signedUrl: 'https://signed.test/a.jpg' }],
      error: null,
    })

    const [first] = await catalogue.addSignedImageUrls([products[0]])
    const urls = first.product_images.map((image) => image.signedUrl)
    expect(urls).toEqual(['https://signed.test/a.jpg', null])
  })

  it('skips the storage round-trip when no product has images', async () => {
    const plain = [{ id: 'p2', product_images: [] }, { id: 'p3', product_images: null }]
    const result = await catalogue.addSignedImageUrls(plain)

    expect(supa.createSignedUrls).not.toHaveBeenCalled()
    expect(result).toEqual(plain)
  })

  it('propagates storage errors', async () => {
    supa.createSignedUrls.mockResolvedValue({ data: null, error: new Error('storage unavailable') })
    await expect(catalogue.addSignedImageUrls([products[0]])).rejects.toThrow('storage unavailable')
  })
})

describe('getPublishedProducts', () => {
  function scriptQuery(response) {
    const order = vi.fn(async () => response)
    const eqCalls = []
    const builder = {
      eq: vi.fn((column, value) => {
        eqCalls.push([column, value])
        return builder
      }),
      order,
    }
    const select = vi.fn(() => builder)
    supa.from.mockImplementation((table) => {
      supa.queriedTable = table
      return { select }
    })
    return { select, order, eqCalls }
  }

  it('requests products ordered by name and returns them with signed URLs', async () => {
    const response = {
      data: [{ id: 'p1', name: 'Lavender', slug: 'lavender', is_published: true, product_images: [] }],
      error: null,
    }
    const { select, order, eqCalls } = scriptQuery(response)

    const result = await catalogue.getPublishedProducts()

    expect(supa.queriedTable).toBe('products')
    // The projection must include every field the UI relies on — no more (no
    // hidden columns), no less (no missing publication/stock flags).
    const projection = select.mock.calls[0][0]
    for (const field of [
      'id',
      'name',
      'slug',
      'description',
      'price',
      'currency',
      'category',
      'stock_quantity',
      'is_available',
      'is_featured',
      'is_published',
      'product_images',
    ]) {
      expect(projection).toContain(field)
    }
    expect(order).toHaveBeenCalledWith('name')
    // Draft and unavailable products must never reach the public catalogue, even
    // when the caller holds an admin session that RLS would otherwise let read
    // every row.
    expect(eqCalls).toContainEqual(['is_published', true])
    expect(eqCalls).toContainEqual(['is_available', true])
    expect(result).toEqual(response.data)
  })

  it('propagates query errors', async () => {
    scriptQuery({ data: null, error: new Error('relation does not exist') })
    await expect(catalogue.getPublishedProducts()).rejects.toThrow('relation does not exist')
  })
})

describe('getPublishedProductBySlug', () => {
  function scriptSlugQuery(response) {
    const maybeSingle = vi.fn(async () => response)
    const eqCalls = []
    const builder = {
      eq: vi.fn((column, value) => {
        eqCalls.push([column, value])
        return builder
      }),
      maybeSingle,
    }
    supa.from.mockImplementation((table) => ({ select: () => builder }))
    return { eqCalls, maybeSingle }
  }

  it('looks the product up by slug', async () => {
    const product = { id: 'p1', name: 'Rose Water', slug: 'rose-water', is_published: true, product_images: [] }
    const { eqCalls } = scriptSlugQuery({ data: product, error: null })

    const result = await catalogue.getPublishedProductBySlug('rose-water')

    expect(eqCalls).toContainEqual(['slug', 'rose-water'])
    // A published+available product is the only thing the public route may show.
    expect(eqCalls).toContainEqual(['is_published', true])
    expect(eqCalls).toContainEqual(['is_available', true])
    expect(result).toEqual(product)
  })

  it('returns null when no product matches the slug', async () => {
    scriptSlugQuery({ data: null, error: null })
    await expect(catalogue.getPublishedProductBySlug('missing')).resolves.toBeNull()
  })

  it('propagates query errors', async () => {
    scriptSlugQuery({ data: null, error: new Error('timeout') })
    await expect(catalogue.getPublishedProductBySlug('rose-water')).rejects.toThrow('timeout')
  })
})

describe('missing Supabase configuration', () => {
  it('throws CatalogueConfigurationError instead of querying when unconfigured', async () => {
    const unconfigured = await loadProducts({ url: '', key: '' })

    await expect(unconfigured.getPublishedProducts()).rejects.toMatchObject({
      name: 'CatalogueConfigurationError',
      message: 'The catalogue is not connected yet.',
    })
    await expect(unconfigured.getPublishedProductBySlug('rose-water')).rejects.toMatchObject({
      name: 'CatalogueConfigurationError',
    })
    expect(supa.from).not.toHaveBeenCalled()
  })
})
