import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/CatalogueStates'
import ProductGrid from '../components/ProductGrid'
import { useProducts } from '../lib/useProducts'

export default function HomePage() {
  const { products, status, error, retry } = useProducts()
  const featuredProducts = products.filter((product) => product.is_featured).slice(0, 4)
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))]

  return (
    <>
      <section className="intro-section">
        <div className="page-width intro-content">
          <p className="eyebrow">Product catalogue</p>
          <h1>DR.MURUGAN’s flower remedies</h1>
          <p className="intro-copy">Browse owner-published products and enquire directly for availability, delivery options, and final pricing.</p>
          <Link className="button" to="/shop">Browse products</Link>
        </div>
      </section>

      <section className="page-width section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalogue</p>
            <h2>Featured products</h2>
          </div>
          <Link className="text-link" to="/shop">View all products <span aria-hidden="true">→</span></Link>
        </div>

        {status === 'loading' ? <LoadingState /> : null}
        {status === 'error' ? <ErrorState error={error} onRetry={retry} /> : null}
        {status === 'success' && featuredProducts.length > 0 ? <ProductGrid products={featuredProducts} /> : null}
        {status === 'success' && featuredProducts.length === 0 ? <EmptyState>Featured products will appear here when the owner publishes them.</EmptyState> : null}
      </section>

      {status === 'success' && categories.length > 0 ? (
        <section className="category-strip">
          <div className="page-width">
            <p className="eyebrow">Browse by category</p>
            <div className="category-links">
              {categories.map((category) => <Link key={category} to={`/shop?category=${encodeURIComponent(category)}`}>{category}</Link>)}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
