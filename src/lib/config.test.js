import { afterEach, describe, expect, it, vi } from 'vitest'

// config.js captures import.meta.env values at module load, so every case
// reloads the module with explicitly stubbed variables. These tests never read
// .env.local and only ever assert against the fake values defined below.

const FAKE_URL = 'https://example.supabase.test'
const FAKE_KEY = 'test-publishable-key'

async function loadConfig(env = {}) {
  vi.stubEnv('VITE_SUPABASE_URL', env.url ?? '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', env.key ?? '')
  vi.stubEnv('VITE_WHATSAPP_NUMBER', env.whatsapp ?? '')
  vi.resetModules()
  return import('./config')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('supabaseConfig', () => {
  it('trims whitespace around the configured values', async () => {
    const { supabaseConfig } = await loadConfig({
      url: `  ${FAKE_URL}  `,
      key: `  ${FAKE_KEY}\n`,
    })
    expect(supabaseConfig.url).toBe(FAKE_URL)
    expect(supabaseConfig.publishableKey).toBe(FAKE_KEY)
  })

  it('falls back to empty strings when the variables are missing', async () => {
    const { supabaseConfig } = await loadConfig()
    expect(supabaseConfig.url).toBe('')
    expect(supabaseConfig.publishableKey).toBe('')
  })
})

describe('isSupabaseConfigured', () => {
  it('is true only when both the URL and the publishable key are present', async () => {
    const configured = await loadConfig({ url: FAKE_URL, key: FAKE_KEY })
    expect(configured.isSupabaseConfigured).toBe(true)
  })

  it('is false when the key is missing', async () => {
    const configured = await loadConfig({ url: FAKE_URL })
    expect(configured.isSupabaseConfigured).toBe(false)
  })

  it('is false when the URL is missing', async () => {
    const configured = await loadConfig({ key: FAKE_KEY })
    expect(configured.isSupabaseConfigured).toBe(false)
  })

  it('is false when both variables are missing', async () => {
    const configured = await loadConfig()
    expect(configured.isSupabaseConfigured).toBe(false)
  })

  it('treats whitespace-only values as missing', async () => {
    const configured = await loadConfig({ url: '   ', key: '\t' })
    expect(configured.isSupabaseConfigured).toBe(false)
  })
})

describe('getWhatsAppNumber', () => {
  it('strips formatting characters and keeps the digits', async () => {
    const { getWhatsAppNumber } = await loadConfig({ whatsapp: '+91 98765-43210' })
    expect(getWhatsAppNumber()).toBe('919876543210')
  })

  it('trims surrounding whitespace', async () => {
    const { getWhatsAppNumber } = await loadConfig({ whatsapp: '  9876543210  ' })
    expect(getWhatsAppNumber()).toBe('9876543210')
  })

  it('accepts the minimum length of 8 digits', async () => {
    const { getWhatsAppNumber } = await loadConfig({ whatsapp: '12345678' })
    expect(getWhatsAppNumber()).toBe('12345678')
  })

  it('accepts the maximum length of 15 digits', async () => {
    const { getWhatsAppNumber } = await loadConfig({ whatsapp: '123456789012345' })
    expect(getWhatsAppNumber()).toBe('123456789012345')
  })

  it('rejects numbers shorter than 8 digits', async () => {
    const { getWhatsAppNumber } = await loadConfig({ whatsapp: '1234567' })
    expect(getWhatsAppNumber()).toBeNull()
  })

  it('rejects numbers longer than 15 digits', async () => {
    const { getWhatsAppNumber } = await loadConfig({ whatsapp: '1234567890123456' })
    expect(getWhatsAppNumber()).toBeNull()
  })

  it('rejects numbers that start with zero', async () => {
    const { getWhatsAppNumber } = await loadConfig({ whatsapp: '09876543210' })
    expect(getWhatsAppNumber()).toBeNull()
  })

  it('rejects values with no digits at all', async () => {
    const { getWhatsAppNumber } = await loadConfig({ whatsapp: 'not-a-number' })
    expect(getWhatsAppNumber()).toBeNull()
  })

  it('returns null when the variable is missing', async () => {
    const { getWhatsAppNumber } = await loadConfig()
    expect(getWhatsAppNumber()).toBeNull()
  })

  it('returns null for an empty or whitespace-only value', async () => {
    const empty = await loadConfig({ whatsapp: '' })
    expect(empty.getWhatsAppNumber()).toBeNull()

    const blank = await loadConfig({ whatsapp: '   ' })
    expect(blank.getWhatsAppNumber()).toBeNull()
  })
})

describe('getProductUrl', () => {
  it('builds a product URL from the current origin and the slug', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://shop.example.test' } })
    const { getProductUrl } = await loadConfig()
    expect(getProductUrl('rose-water')).toBe('https://shop.example.test/products/rose-water')
  })

  it('percent-encodes slugs that contain URL-unsafe characters', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://shop.example.test' } })
    const { getProductUrl } = await loadConfig()
    expect(getProductUrl('a/b?c#d')).toBe('https://shop.example.test/products/a%2Fb%3Fc%23d')
  })
})

describe('supabase client creation', () => {
  it('exports a null client when the project is not configured', async () => {
    await loadConfig()
    const { supabase } = await import('./supabase')
    expect(supabase).toBeNull()
  })

  it('creates a client with the expected API surface from fake configuration values', async () => {
    await loadConfig({ url: FAKE_URL, key: FAKE_KEY })
    const { supabase } = await import('./supabase')
    expect(supabase).not.toBeNull()
    expect(typeof supabase.from).toBe('function')
    expect(typeof supabase.auth.signInWithPassword).toBe('function')
  })
})
