import { describe, expect, it, vi } from 'vitest'
import { initialFormValues, resolveSaveAction, toPayload, validate } from './ProductForm'

// Unit tests for the pure form logic inside ProductForm.jsx. The Supabase module
// is stubbed out entirely so importing the component graph touches no network
// and no real configuration.

vi.mock('../../lib/supabase', () => ({ supabase: null }))

describe('initialFormValues', () => {
  it('provides create-mode defaults when there is no product', () => {
    expect(initialFormValues(null)).toEqual({
      name: '',
      slug: '',
      description: '',
      price: '',
      currency: 'INR',
      category: '',
      stockQuantity: '',
      isAvailable: true,
      isFeatured: false,
      isPublished: false,
    })
  })

  it('maps an existing product into editable string values', () => {
    expect(
      initialFormValues({
        name: 'Rose Water',
        slug: 'rose-water',
        description: 'Pure distillate',
        price: 199.5,
        currency: 'INR',
        category: 'Remedies',
        stock_quantity: 12,
        is_available: false,
        is_featured: true,
        is_published: true,
      }),
    ).toEqual({
      name: 'Rose Water',
      slug: 'rose-water',
      description: 'Pure distillate',
      price: '199.5',
      currency: 'INR',
      category: 'Remedies',
      stockQuantity: '12',
      isAvailable: false,
      isFeatured: true,
      isPublished: true,
    })
  })

  it('renders zero price and zero stock as "0", not as an empty field', () => {
    const values = initialFormValues({ price: 0, stock_quantity: 0, is_available: true })
    expect(values.price).toBe('0')
    expect(values.stockQuantity).toBe('0')
  })

  it('renders null price and stock as empty (untracked) fields', () => {
    const values = initialFormValues({ price: null, stock_quantity: null, is_available: false })
    expect(values.price).toBe('')
    expect(values.stockQuantity).toBe('')
    expect(values.isAvailable).toBe(false)
  })
})

describe('validate', () => {
  const valid = {
    name: 'Rose Water',
    slug: 'rose-water',
    description: '',
    price: '199',
    currency: 'INR',
    category: '',
    stockQuantity: '5',
    isAvailable: true,
    isFeatured: false,
    isPublished: false,
  }

  it('accepts a fully valid form', () => {
    expect(validate(valid)).toEqual({})
  })

  it('accepts an optional-price, optional-stock form', () => {
    expect(validate({ ...valid, price: '', stockQuantity: '' })).toEqual({})
  })

  it('requires a product name', () => {
    expect(validate({ ...valid, name: '' })).toEqual({ name: 'Enter a product name.' })
    expect(validate({ ...valid, name: '   ' })).toEqual({ name: 'Enter a product name.' })
  })

  it('requires a slug in the database format', () => {
    expect(validate({ ...valid, slug: '' })).toEqual({ slug: 'Enter a URL slug.' })

    const invalidSlug = 'Use lower-case letters, numbers and single hyphens only (no leading, trailing or double hyphens).'
    expect(validate({ ...valid, slug: 'Not A Slug' }).slug).toBe(invalidSlug)
    expect(validate({ ...valid, slug: '-rose' }).slug).toBe(invalidSlug)
    expect(validate({ ...valid, slug: 'rose-' }).slug).toBe(invalidSlug)
    expect(validate({ ...valid, slug: 'rose--water' }).slug).toBe(invalidSlug)
    expect(validate({ ...valid, slug: 'Rose_Water' }).slug).toBe(invalidSlug)
  })

  it('accepts valid slug boundaries', () => {
    expect(validate({ ...valid, slug: 'r' })).toEqual({})
    expect(validate({ ...valid, slug: 'rose-water-2' })).toEqual({})
    expect(validate({ ...valid, slug: '999' })).toEqual({})
  })

  describe('price', () => {
    it('accepts blank, integer and two-decimal prices', () => {
      expect(validate({ ...valid, price: '' })).toEqual({})
      expect(validate({ ...valid, price: '0' })).toEqual({})
      expect(validate({ ...valid, price: '10.99' })).toEqual({})
      expect(validate({ ...valid, price: ' 42 ' })).toEqual({})
    })

    it('rejects malformed prices', () => {
      const error = 'Enter a non-negative amount with at most two decimals.'
      expect(validate({ ...valid, price: '-5' }).price).toBe(error)
      expect(validate({ ...valid, price: '10.999' }).price).toBe(error)
      expect(validate({ ...valid, price: '10.' }).price).toBe(error)
      expect(validate({ ...valid, price: 'abc' }).price).toBe(error)
      expect(validate({ ...valid, price: '1e3' }).price).toBe(error)
      expect(validate({ ...valid, price: '10,50' }).price).toBe(error)
    })
  })

  describe('currency', () => {
    it('accepts three-letter codes in any case', () => {
      expect(validate({ ...valid, currency: 'INR' })).toEqual({})
      expect(validate({ ...valid, currency: 'usd' })).toEqual({})
    })

    it('rejects missing or malformed codes', () => {
      const error = 'Use a three-letter currency code such as INR.'
      expect(validate({ ...valid, currency: '' }).currency).toBe(error)
      expect(validate({ ...valid, currency: 'IN' }).currency).toBe(error)
      expect(validate({ ...valid, currency: 'RUPEE' }).currency).toBe(error)
    })
  })

  describe('stock quantity', () => {
    it('accepts blank (untracked), zero and positive integers', () => {
      expect(validate({ ...valid, stockQuantity: '' })).toEqual({})
      expect(validate({ ...valid, stockQuantity: '100' })).toEqual({})
      // Zero stock is valid only when the product is not marked available.
      expect(validate({ ...valid, stockQuantity: '0', isAvailable: false })).toEqual({})
    })

    it('rejects negative, fractional and non-numeric stock', () => {
      const error = 'Enter a whole number of 0 or more.'
      expect(validate({ ...valid, stockQuantity: '-1' }).stockQuantity).toBe(error)
      expect(validate({ ...valid, stockQuantity: '10.5' }).stockQuantity).toBe(error)
      expect(validate({ ...valid, stockQuantity: 'ten' }).stockQuantity).toBe(error)
    })
  })

  describe('out-of-stock availability rule', () => {
    it('blocks marking an out-of-stock product as available', () => {
      expect(validate({ ...valid, stockQuantity: '0', isAvailable: true })).toEqual({
        isAvailable: 'Stock quantity is 0, so this product cannot be marked available. Increase stock or turn availability off.',
      })
    })

    it('allows zero stock when the product is unavailable', () => {
      expect(validate({ ...valid, stockQuantity: '0', isAvailable: false })).toEqual({})
    })

    it('allows availability when stock is untracked (blank)', () => {
      expect(validate({ ...valid, stockQuantity: '', isAvailable: true })).toEqual({})
    })

    it('allows availability when stock is above zero', () => {
      expect(validate({ ...valid, stockQuantity: '1', isAvailable: true })).toEqual({})
    })
  })
})

describe('resolveSaveAction', () => {
  it('creates when neither an existing nor a previously created id is present', () => {
    expect(resolveSaveAction({ isEdit: false, existingId: null, createdId: null })).toEqual({ type: 'create' })
  })

  it('updates the existing product in edit mode', () => {
    expect(resolveSaveAction({ isEdit: true, existingId: 'p1', createdId: null })).toEqual({ type: 'update', id: 'p1' })
  })

  it('updates the already-created product on a retry instead of inserting a duplicate', () => {
    expect(resolveSaveAction({ isEdit: false, existingId: null, createdId: 'p9' })).toEqual({ type: 'update', id: 'p9' })
  })

  it('prefers the existing id in edit mode even if a created id lingers', () => {
    expect(resolveSaveAction({ isEdit: true, existingId: 'p1', createdId: 'p9' })).toEqual({ type: 'update', id: 'p1' })
  })
})

describe('toPayload', () => {
  it('converts form values into the database payload shape', () => {
    expect(
      toPayload({
        name: '  Rose Water  ',
        slug: '  rose-water  ',
        description: '  Pure distillate  ',
        price: '199.5',
        currency: 'inr',
        category: '  Remedies  ',
        stockQuantity: '12',
        isAvailable: true,
        isFeatured: false,
        isPublished: true,
      }),
    ).toEqual({
      name: 'Rose Water',
      slug: 'rose-water',
      description: 'Pure distillate',
      price: 199.5,
      currency: 'INR',
      category: 'Remedies',
      stock_quantity: 12,
      is_available: true,
      is_featured: false,
      is_published: true,
    })
  })

  it('normalises empty optional fields to null', () => {
    const payload = toPayload({
      name: 'Rose',
      slug: 'rose',
      description: '   ',
      price: '',
      currency: 'INR',
      category: ' ',
      stockQuantity: '',
      isAvailable: false,
      isFeatured: false,
      isPublished: false,
    })
    expect(payload.description).toBeNull()
    expect(payload.category).toBeNull()
    expect(payload.price).toBeNull()
    expect(payload.stock_quantity).toBeNull()
  })

  it('keeps zero price and zero stock as numbers, not null', () => {
    const payload = toPayload({
      name: 'Sample',
      slug: 'sample',
      description: '',
      price: '0',
      currency: 'INR',
      category: '',
      stockQuantity: '0',
      isAvailable: false,
      isFeatured: false,
      isPublished: false,
    })
    expect(payload.price).toBe(0)
    expect(payload.stock_quantity).toBe(0)
  })

  it('upper-cases the currency code', () => {
    const payload = toPayload({
      name: 'Sample',
      slug: 'sample',
      description: '',
      price: '1',
      currency: 'usd',
      category: '',
      stockQuantity: '',
      isAvailable: true,
      isFeatured: false,
      isPublished: false,
    })
    expect(payload.currency).toBe('USD')
  })
})
