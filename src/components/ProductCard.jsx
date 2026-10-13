import { Link } from 'react-router-dom'
import { formatPrice } from '../lib/whatsapp'

export default function ProductCard({ product }) {
  const mainImage = product.product_images?.[0]
  const price = formatPrice(product.price, product.currency)

  return (
    <article className="product-card">
      <Link className="product-image" to={`/products/${encodeURIComponent(product.slug)}`} aria-label={`View ${product.name}`}>
        {mainImage?.signedUrl ? (
          <img src={mainImage.signedUrl} alt={mainImage.alt_text || `${product.name} product image`} loading="lazy" />
        ) : (
          <span className="image-placeholder" aria-label="Product image pending">Image pending</span>
        )}
      </Link>
      <div className="product-card-content">
        {product.category ? <p className="eyebrow">{product.category}</p> : null}
        <h3><Link to={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link></h3>
        <p className="product-meta">{price || 'Price to be confirmed'}</p>
        <p className="availability" aria-label="Availability">Available — confirmation required</p>
        <Link className="text-link" to={`/products/${encodeURIComponent(product.slug)}`}>View details <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  )
}
