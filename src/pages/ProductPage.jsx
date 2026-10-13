import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../components/CatalogueStates'
import { isSupabaseConfigured } from '../lib/config'
import { getPublishedProductBySlug } from '../lib/products'
import { formatPrice, getProductEnquiryUrl } from '../lib/whatsapp'

export default function ProductPage() {
  const { slug } = useParams()
  const [product, setProduct] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  async function loadProduct() {
    setStatus('loading')
    setError(null)
    try {
      setProduct(await getPublishedProductBySlug(slug))
      setStatus('success')
    } catch (loadError) {
      setError(loadError)
      setStatus('error')
    }
  }

  useEffect(() => {
    loadProduct()
  }, [slug])

  useEffect(() => {
    if (product) document.title = `${product.name} | DR.MURUGAN’s flower remedies`
    return () => { document.title = 'DR.MURUGAN’s flower remedies' }
  }, [product])

  if (status === 'loading') return <div className="page-width section"><LoadingState label="Loading product…" /></div>
  if (status === 'error') return <div className="page-width section"><ErrorState error={error} onRetry={loadProduct} /></div>
  if (!product || !isSupabaseConfigured) return <ProductUnavailable />

  const images = product.product_images ?? []
  const enquiryUrl = getProductEnquiryUrl(product)
  const price = formatPrice(product.price, product.currency)

  return (
    <article className="page-width section product-page">
      <Link className="back-link" to="/shop">← Back to products</Link>
      <div className="product-layout">
        <section className="product-gallery" aria-label={`${product.name} images`}>
          {images.length > 0 ? images.map((image) => (
            image.signedUrl ? <img key={image.id} src={image.signedUrl} alt={image.alt_text || `${product.name} product image`} /> : null
          )) : <div className="image-placeholder product-image-large">Image pending</div>}
        </section>
        <section className="product-details">
          {product.category ? <p className="eyebrow">{product.category}</p> : null}
          <h1>{product.name}</h1>
          <p className="product-price">{price || 'Price to be confirmed'}</p>
          <p className="availability">Availability is confirmed by the owner before an order is accepted.</p>
          {product.description ? <div className="product-description"><p>{product.description}</p></div> : <p className="muted">Product description is being prepared by the owner.</p>}
          {enquiryUrl ? (
            <a className="button" href={enquiryUrl} target="_blank" rel="noreferrer">Enquire on WhatsApp</a>
          ) : (
            <p className="setup-note" role="status">WhatsApp enquiries will be available once the business contact number is verified.</p>
          )}
        </section>
      </div>
    </article>
  )
}

function ProductUnavailable() {
  return (
    <section className="page-width section catalogue-state">
      <h1>Product unavailable</h1>
      <p>This product may be unpublished, unavailable, or still being prepared.</p>
      <Link className="button button-secondary" to="/shop">Browse products</Link>
    </section>
  )
}
