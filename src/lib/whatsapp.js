import { getProductUrl, getWhatsAppNumber } from './config'

export function formatPrice(price, currency = 'INR') {
  if (price === null || price === undefined || price === '') return null

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(price))
}

export function getProductEnquiryUrl(product) {
  const whatsappNumber = getWhatsAppNumber()
  if (!whatsappNumber) return null

  const price = formatPrice(product.price, product.currency)
  const details = [
    `Hello, I am enquiring about ${product.name}.`,
    price ? `The displayed price is ${price}.` : null,
    `Product page: ${getProductUrl(product.slug)}`,
    'Could you please confirm availability, final price, shipping charges, delivery options, and order acceptance?',
  ].filter(Boolean)

  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(details.join('\n\n'))}`
}
