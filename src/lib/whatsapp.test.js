import { afterEach, describe, expect, it, vi } from 'vitest'

// whatsapp.js reads the WhatsApp number and product URL through config.js, which
// captures environment variables at module load. Each helper call therefore
// reloads the modules with explicitly stubbed values; no real configuration is
// ever read or printed.

const SHOP_ORIGIN = 'https://shop.example.test'

async function loadWhatsapp(env = {}) {
  vi.stubEnv('VITE_WHATSAPP_NUMBER', env.whatsapp ?? '')
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
  vi.stubGlobal('window', { location: { origin: SHOP_ORIGIN } })
  vi.resetModules()
  return import('./whatsapp')
}

function messageFrom(url) {
  const [, text] = url.split('?text=')
  return decodeURIComponent(text)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('formatPrice', () => {
  it('returns null for missing prices', async () => {
    const { formatPrice } = await loadWhatsapp()
    expect(formatPrice(null)).toBeNull()
    expect(formatPrice(undefined)).toBeNull()
    expect(formatPrice('')).toBeNull()
  })

  it('formats whole rupee amounts with two decimals and Indian grouping', async () => {
    const { formatPrice } = await loadWhatsapp()
    expect(formatPrice(1999)).toBe('₹1,999.00')
    expect(formatPrice(100000)).toBe('₹1,00,000.00')
    expect(formatPrice(0)).toBe('₹0.00')
  })

  it('formats fractional amounts to at most two decimals', async () => {
    const { formatPrice } = await loadWhatsapp()
    expect(formatPrice(1999.5)).toBe('₹1,999.50')
    expect(formatPrice(0.5)).toBe('₹0.50')
  })

  it('rounds beyond two decimal places', async () => {
    const { formatPrice } = await loadWhatsapp()
    expect(formatPrice(12.345)).toBe('₹12.35')
    expect(formatPrice(1999.999)).toBe('₹2,000.00')
  })

  it('accepts numeric strings', async () => {
    const { formatPrice } = await loadWhatsapp()
    expect(formatPrice('499')).toBe('₹499.00')
  })

  it('uses the product currency when provided', async () => {
    const { formatPrice } = await loadWhatsapp()
    expect(formatPrice(12.5, 'USD')).toBe('$12.50')
    expect(formatPrice(12.5, 'EUR')).toBe('€12.50')
  })

  it('defaults to INR when no currency is given', async () => {
    const { formatPrice } = await loadWhatsapp()
    expect(formatPrice(1999)).toBe(formatPrice(1999, 'INR'))
  })
})

describe('getProductEnquiryUrl', () => {
  it('builds a wa.me URL with a safely encoded message', async () => {
    const { getProductEnquiryUrl } = await loadWhatsapp({ whatsapp: '+91 98765 43210' })

    const url = getProductEnquiryUrl({
      name: 'Rose & Jasmine',
      price: 199,
      currency: 'INR',
      slug: 'rose-jasmine',
    })

    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true)
    // The raw URL must not contain characters that would break query parsing.
    expect(url).not.toMatch(/[\s#]/)
    expect(messageFrom(url)).toBe(
      [
        'Hello, I am enquiring about Rose & Jasmine.',
        'The displayed price is ₹199.00.',
        `Product page: ${SHOP_ORIGIN}/products/rose-jasmine`,
        'Could you please confirm availability, final price, shipping charges, delivery options, and order acceptance?',
      ].join('\n\n'),
    )
  })

  it('omits the price line when the product has no price', async () => {
    const { getProductEnquiryUrl } = await loadWhatsapp({ whatsapp: '9876543210' })

    const url = getProductEnquiryUrl({ name: 'Lavender', price: null, slug: 'lavender' })
    const message = messageFrom(url)

    expect(message).toContain('Hello, I am enquiring about Lavender.')
    expect(message).not.toContain('displayed price')
    expect(message).toContain(`${SHOP_ORIGIN}/products/lavender`)
  })

  it('defaults the price line to INR when the product has no currency', async () => {
    const { getProductEnquiryUrl } = await loadWhatsapp({ whatsapp: '9876543210' })

    const url = getProductEnquiryUrl({ name: 'Chamomile', price: 250, slug: 'chamomile' })
    expect(messageFrom(url)).toContain('The displayed price is ₹250.00.')
  })

  it('round-trips non-ASCII product names without corruption', async () => {
    const { getProductEnquiryUrl } = await loadWhatsapp({ whatsapp: '9876543210' })

    const name = 'முருகன் Flower 🌸 Remedies'
    const url = getProductEnquiryUrl({ name, price: 99, slug: 'flower-remedy' })

    expect(messageFrom(url)).toContain(name)
  })

  it('encodes the slug inside the product page link', async () => {
    const { getProductEnquiryUrl } = await loadWhatsapp({ whatsapp: '9876543210' })

    const url = getProductEnquiryUrl({ name: 'Rose', price: 10, slug: 'rose/white' })
    expect(messageFrom(url)).toContain(`${SHOP_ORIGIN}/products/rose%2Fwhite`)
  })

  it('returns null when no WhatsApp number is configured', async () => {
    const { getProductEnquiryUrl } = await loadWhatsapp({ whatsapp: '' })
    expect(getProductEnquiryUrl({ name: 'Rose', price: 10, slug: 'rose' })).toBeNull()
  })

  it('returns null when the configured number is invalid', async () => {
    const { getProductEnquiryUrl } = await loadWhatsapp({ whatsapp: '12345' })
    expect(getProductEnquiryUrl({ name: 'Rose', price: 10, slug: 'rose' })).toBeNull()
  })
})
