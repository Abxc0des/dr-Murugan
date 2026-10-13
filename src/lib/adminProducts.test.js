import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Unit tests for the pure helpers in adminProducts.js plus the slug-collision
// retry logic. The Supabase module is replaced with an in-memory fake so no
// request ever reaches the real project, and environment variables are stubbed
// with fake values so no real configuration is read.

const supa = vi.hoisted(() => ({
  from: vi.fn(),
  storageFrom: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args) => supa.from(...args),
    storage: { from: (...args) => supa.storageFrom(...args) },
  },
}))

async function loadAdminProducts(env = {}) {
  vi.stubEnv('VITE_SUPABASE_URL', env.url ?? 'https://example.supabase.test')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', env.key ?? 'test-publishable-key')
  vi.stubEnv('VITE_WHATSAPP_NUMBER', env.whatsapp ?? '')
  vi.resetModules()
  return import('./adminProducts')
}

let admin
beforeEach(async () => {
  supa.from.mockReset()
  supa.storageFrom.mockReset()
  admin = await loadAdminProducts()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('module constants', () => {
  it('caps images at 5 MB', () => {
    expect(admin.IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024)
  })

  it('accepts only the documented image types in the file input', () => {
    expect(admin.IMAGE_ACCEPT_ATTRIBUTE).toBe('image/jpeg,image/png,image/webp')
    expect(Object.keys(admin.IMAGE_MIME_EXTENSIONS)).toEqual(['image/jpeg', 'image/png', 'image/webp'])
  })
})

describe('slugify', () => {
  const slugCheck = /^[a-z0-9]+(-[a-z0-9]+)*$/

  it('turns a product name into a URL-safe slug', () => {
    expect(admin.slugify('Rose Water 200ml')).toBe('rose-water-200ml')
    expect(admin.slugify('  Hello, World!  ')).toBe('hello-world')
    expect(admin.slugify('100% Pure & Simple')).toBe('100-pure-simple')
  })

  it('lower-cases and collapses runs of separators into single hyphens', () => {
    expect(admin.slugify('UPPER CASE')).toBe('upper-case')
    expect(admin.slugify('a---b // c')).toBe('a-b-c')
  })

  it('strips leading and trailing hyphens', () => {
    expect(admin.slugify('--leading and trailing--')).toBe('leading-and-trailing')
  })

  it('is idempotent for an already valid slug', () => {
    expect(admin.slugify('already-a-slug')).toBe('already-a-slug')
    expect(admin.slugify(admin.slugify('Already A Slug'))).toBe('already-a-slug')
  })

  it('removes accents via Unicode normalization', () => {
    expect(admin.slugify('Élan Vital')).toBe('elan-vital')
  })

  it('drops characters from non-Latin scripts entirely', () => {
    expect(admin.slugify('முருகன் Remedies')).toBe('remedies')
  })

  it('returns an empty string for empty, null or undefined input', () => {
    expect(admin.slugify('')).toBe('')
    expect(admin.slugify(null)).toBe('')
    expect(admin.slugify(undefined)).toBe('')
    expect(admin.slugify('!!!')).toBe('')
  })

  it('produces slugs that satisfy the products.slug database CHECK pattern for non-empty names', () => {
    const inputs = [
      'Rose Water 200ml',
      'Élan Vital',
      '--weird -- input--',
      'a',
      '123',
      'முருகன் Remedies',
      'Multiple   spaces',
      '___underscores___',
    ]
    for (const input of inputs) {
      expect(admin.slugify(input)).toMatch(slugCheck)
    }
    // Symbol-only input collapses to empty rather than an invalid slug.
    expect(admin.slugify('!!!')).toBe('')
  })
})

describe('validateImageFile', () => {
  it('allows every accepted type at or below the size limit', () => {
    expect(admin.validateImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(admin.validateImageFile({ type: 'image/png', size: 0 })).toBeNull()
    expect(admin.validateImageFile({ type: 'image/webp', size: admin.IMAGE_MAX_BYTES })).toBeNull()
  })

  it('accepts exactly 5 MB (boundary) but rejects one byte more', () => {
    expect(admin.validateImageFile({ type: 'image/jpeg', size: admin.IMAGE_MAX_BYTES })).toBeNull()
    expect(admin.validateImageFile({ type: 'image/jpeg', size: admin.IMAGE_MAX_BYTES + 1 })).toBe(
      'The image must be 5 MB or smaller.',
    )
  })

  it('rejects unsupported MIME types', () => {
    expect(admin.validateImageFile({ type: 'image/gif', size: 1000 })).toBe(
      'Choose a JPEG, PNG, or WebP image.',
    )
    expect(admin.validateImageFile({ type: 'application/pdf', size: 1000 })).toBe(
      'Choose a JPEG, PNG, or WebP image.',
    )
    expect(admin.validateImageFile({ type: '', size: 1000 })).toBe('Choose a JPEG, PNG, or WebP image.')
  })

  it('checks the MIME type before the size', () => {
    expect(admin.validateImageFile({ type: 'image/gif', size: admin.IMAGE_MAX_BYTES + 1 })).toBe(
      'Choose a JPEG, PNG, or WebP image.',
    )
  })

  it('returns null when no file is present', () => {
    expect(admin.validateImageFile(null)).toBeNull()
    expect(admin.validateImageFile(undefined)).toBeNull()
  })
})

describe('buildImagePath', () => {
  it('builds a grouped path under the product id with the right extension', () => {
    for (const [type, extension] of Object.entries(admin.IMAGE_MIME_EXTENSIONS)) {
      const path = admin.buildImagePath('product-1', { type, size: 10 })
      // products/<id>/<uuid>.<ext>
      expect(path).toMatch(new RegExp(`^products/product-1/[^/]+\\.${extension}$`))
      expect(path.split('/')).toHaveLength(3)
    }
  })

  it('generates a distinct path for every upload (no overwrite collisions)', () => {
    const file = { type: 'image/png', size: 10 }
    const paths = new Set(Array.from({ length: 20 }, () => admin.buildImagePath('p1', file)))
    expect(paths.size).toBe(20)
  })

  it('throws for unsupported image types instead of writing a bad object', () => {
    expect(() => admin.buildImagePath('p1', { type: 'image/gif' })).toThrow('That image type is not supported.')
    expect(() => admin.buildImagePath('p1', undefined)).toThrow('That image type is not supported.')
  })
})

describe('isSlugConflict', () => {
  const slugConflict = { code: '23505', message: 'duplicate key value violates unique constraint "products_slug_key"' }

  it('recognises a unique violation on the slug column', () => {
    expect(admin.isSlugConflict(slugConflict)).toBe(true)
    expect(admin.isSlugConflict({ code: '23505', message: 'duplicate SLUG value' })).toBe(true)
  })

  it('ignores unique violations on other constraints', () => {
    expect(admin.isSlugConflict({ code: '23505', message: 'duplicate key value violates unique constraint "products_pkey"' })).toBe(false)
  })

  it('ignores other error codes and empty input', () => {
    expect(admin.isSlugConflict({ code: '23503', message: 'slug is referenced' })).toBe(false)
    expect(admin.isSlugConflict(null)).toBe(false)
    expect(admin.isSlugConflict({})).toBe(false)
  })
})

describe('describeDataError', () => {
  it('maps a missing admin configuration', async () => {
    const unconfigured = await loadAdminProducts({ url: '', key: '' })
    let caught = null
    try {
      await unconfigured.getAdminProducts()
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ name: 'AdminConfigurationError' })
    expect(unconfigured.describeDataError(caught)).toBe('Administration is not connected yet.')
  })

  it('maps a slug collision to an owner-friendly message', () => {
    expect(
      admin.describeDataError({ code: '23505', message: 'duplicate key value violates unique constraint "products_slug_key"' }),
    ).toBe('That URL slug is already used by another product.')
  })

  it('keeps authorization failures distinct from other errors', () => {
    expect(admin.describeDataError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(
      'Your account is not allowed to perform this action.',
    )
    expect(admin.describeDataError(new Error('permission denied for table products'))).toBe(
      'Your account is not allowed to perform this action.',
    )
  })

  it('maps an expired or missing session', () => {
    expect(admin.describeDataError({ name: 'AuthSessionMissingError', message: 'no session' })).toBe(
      'Your session has expired. Sign in again to continue.',
    )
    expect(admin.describeDataError({ code: 'PGRST301', message: 'JWT expired' })).toBe(
      'Your session has expired. Sign in again to continue.',
    )
  })

  it('maps connectivity failures', () => {
    expect(admin.describeDataError(new TypeError('Failed to fetch'))).toBe(
      'We could not reach the server. Check your connection and try again.',
    )
    expect(admin.describeDataError(new TypeError('network error'))).toBe(
      'We could not reach the server. Check your connection and try again.',
    )
  })

  it('falls back to the raw message, then to a generic message', () => {
    expect(admin.describeDataError(new Error('boom'))).toBe('boom')
    expect(admin.describeDataError(new Error(''))).toBe('Something went wrong. Please try again.')
    expect(admin.describeDataError(null)).toBe('Something went wrong. Please try again.')
  })
})

describe('getPrimaryImage', () => {
  it('returns the image with the lowest position', () => {
    const product = {
      product_images: [
        { id: 'b', position: 2, alt_text: 'Second' },
        { id: 'c', position: 9, alt_text: 'Third' },
        { id: 'a', position: 0, alt_text: 'First' },
      ],
    }
    expect(admin.getPrimaryImage(product)).toMatchObject({ id: 'a', alt_text: 'First' })
  })

  it('treats a missing position as 0 and keeps the first match', () => {
    const product = { product_images: [{ id: 'x' }, { id: 'y', position: 0 }] }
    expect(admin.getPrimaryImage(product)).toMatchObject({ id: 'x' })
  })

  it('returns null when there is no image or no product', () => {
    expect(admin.getPrimaryImage({})).toBeNull()
    expect(admin.getPrimaryImage({ product_images: null })).toBeNull()
    expect(admin.getPrimaryImage(null)).toBeNull()
    expect(admin.getPrimaryImage(undefined)).toBeNull()
  })
})

describe('getProductAvailabilityFlags', () => {
  it('locks an out-of-stock product that is already unavailable', () => {
    expect(admin.getProductAvailabilityFlags({ stock_quantity: 0, is_available: false })).toEqual({
      outOfStock: true,
      availabilityLocked: true,
    })
  })

  it('does not lock an out-of-stock product that is still marked available', () => {
    expect(admin.getProductAvailabilityFlags({ stock_quantity: 0, is_available: true })).toEqual({
      outOfStock: true,
      availabilityLocked: false,
    })
  })

  it('never locks a product that has stock', () => {
    expect(admin.getProductAvailabilityFlags({ stock_quantity: 1, is_available: false })).toEqual({
      outOfStock: false,
      availabilityLocked: false,
    })
  })

  it('does not treat untracked stock (null) as out of stock', () => {
    expect(admin.getProductAvailabilityFlags({ stock_quantity: null, is_available: true })).toEqual({
      outOfStock: false,
      availabilityLocked: false,
    })
  })

  it('is safe for missing products', () => {
    expect(admin.getProductAvailabilityFlags(undefined)).toEqual({ outOfStock: false, availabilityLocked: false })
  })
})

// Scripts a chainable fake for supabase.from('products').insert(...).select(...).single()
// returning the given responses in order, capturing every inserted payload.
function scriptInserts(responses) {
  const payloads = []
  supa.from.mockImplementation(() => ({
    insert: (payload) => {
      payloads.push(payload)
      return {
        select: () => ({
          single: async () => responses.shift() ?? { data: null, error: new Error('no scripted response left') },
        }),
      }
    },
  }))
  return payloads
}

const slugConflictError = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "products_slug_key"',
}

describe('createProductWithUniqueSlug', () => {
  const input = { name: 'Rose Water', slug: 'rose-water', price: 199 }

  it('returns the created product on the first attempt', async () => {
    const created = { id: 'p1', slug: 'rose-water' }
    const payloads = scriptInserts([{ data: created, error: null }])

    await expect(admin.createProductWithUniqueSlug(input)).resolves.toEqual(created)
    expect(payloads).toEqual([input])
    expect(supa.from).toHaveBeenCalledTimes(1)
  })

  it('retries with a numeric slug suffix when the slug already exists', async () => {
    const created = { id: 'p2', slug: 'rose-water-2' }
    const payloads = scriptInserts([
      { data: null, error: slugConflictError },
      { data: created, error: null },
    ])

    await expect(admin.createProductWithUniqueSlug(input)).resolves.toEqual(created)
    expect(payloads).toEqual([input, { ...input, slug: 'rose-water-2' }])
    expect(supa.from).toHaveBeenCalledTimes(2)
  })

  it('throws immediately for errors that are not slug conflicts', async () => {
    const payloads = scriptInserts([{ data: null, error: { code: '23503', message: 'foreign key violation' } }])

    await expect(admin.createProductWithUniqueSlug(input)).rejects.toMatchObject({ code: '23503' })
    expect(payloads).toHaveLength(1)
  })

  it('gives up after the attempt limit with a friendly message instead of looping forever', async () => {
    const payloads = scriptInserts([
      { data: null, error: slugConflictError },
      { data: null, error: slugConflictError },
      { data: null, error: slugConflictError },
    ])

    await expect(admin.createProductWithUniqueSlug(input, 3)).rejects.toThrow(
      'A product with this name already exists. Choose a different name.',
    )
    expect(payloads.map((payload) => payload.slug)).toEqual(['rose-water', 'rose-water-2', 'rose-water-3'])
  })
})
