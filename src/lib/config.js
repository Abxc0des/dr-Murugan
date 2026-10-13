const rawWhatsAppNumber = import.meta.env.VITE_WHATSAPP_NUMBER?.trim() ?? ''

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
}

export const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.publishableKey)

export function getWhatsAppNumber() {
  const normalizedNumber = rawWhatsAppNumber.replace(/[^0-9]/g, '')
  return /^[1-9][0-9]{7,14}$/.test(normalizedNumber) ? normalizedNumber : null
}

export function getProductUrl(slug) {
  return `${window.location.origin}/products/${encodeURIComponent(slug)}`
}
