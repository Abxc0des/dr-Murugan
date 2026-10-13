import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../components/CatalogueStates'
import ProductGrid from '../components/ProductGrid'
import { useProducts } from '../lib/useProducts'

export default function ShopPage() {
  const { products, status, error, retry } = useProducts()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const selectedCategory = searchParams.get('category') ?? ''
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort()

  const filteredProducts = useMemo(() => products
    .filter((product) => product.name.toLocaleLowerCase().includes(searchTerm.trim().toLocaleLowerCase()))
    .filter((product) => !selectedCategory || product.category === selectedCategory)
    .sort((firstProduct, secondProduct) => {
      if (sortBy === 'price-low') return Number(firstProduct.price ?? Infinity) - Number(secondProduct.price ?? Infinity)
      if (sortBy === 'price-high') return Number(secondProduct.price ?? -Infinity) - Number(firstProduct.price ?? -Infinity)
      return firstProduct.name.localeCompare(secondProduct.name)
    }), [products, searchTerm, selectedCategory, sortBy])

  function changeCategory(category) {
    if (category) setSearchParams({ category })
    else setSearchParams({})
  }

  return (
    <section className="page-width section shop-page">
      <div className="page-title">
        <p className="eyebrow">Catalogue</p>
        <h1>Browse products</h1>
        <p>Product details and availability are confirmed directly with the owner.</p>
      </div>

      <div className="filters" aria-label="Product filters">
        <label className="search-field">
          <span>Search products</span>
          <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name" />
        </label>
        {categories.length > 0 ? (
          <label>
            <span>Category</span>
            <select value={selectedCategory} onChange={(event) => changeCategory(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          <span>Sort by</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="name">Name</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </select>
        </label>
      </div>

      {status === 'loading' ? <LoadingState /> : null}
      {status === 'error' ? <ErrorState error={error} onRetry={retry} /> : null}
      {status === 'success' && products.length === 0 ? <EmptyState /> : null}
      {status === 'success' && products.length > 0 && filteredProducts.length === 0 ? <EmptyState>No products match your search. Try a different name or category.</EmptyState> : null}
      {status === 'success' && filteredProducts.length > 0 ? <ProductGrid products={filteredProducts} /> : null}
    </section>
  )
}
