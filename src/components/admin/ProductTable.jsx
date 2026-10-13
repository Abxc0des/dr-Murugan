import { Link } from 'react-router-dom'
import { getProductAvailabilityFlags } from '../../lib/adminProducts'
import { formatPrice } from '../../lib/whatsapp'

// Read-only/administrative product list. Toggles and delete are delegated to the
// parent so this component stays presentational.
export default function ProductTable({ products, busyId, onTogglePublished, onToggleAvailable, onDelete }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Category</th>
            <th scope="col">Price</th>
            <th scope="col">Stock</th>
            <th scope="col">Availability</th>
            <th scope="col">Publication</th>
            <th scope="col" className="admin-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const primaryImage = product.product_images?.[0]
            const price = formatPrice(product.price, product.currency)
            const isBusy = busyId === product.id
            const { outOfStock, availabilityLocked } = getProductAvailabilityFlags(product)

            return (
              <tr key={product.id} className={isBusy ? 'is-busy' : undefined}>
                <th scope="row" data-label="Product" className="admin-cell-product">
                  <div className="admin-product-cell">
                    <span className="admin-thumb" aria-hidden="true">
                      {primaryImage?.signedUrl ? (
                        <img src={primaryImage.signedUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="admin-thumb-placeholder">No image</span>
                      )}
                    </span>
                    <span className="admin-product-name">
                      <span className="admin-product-title">{product.name}</span>
                      <span className="admin-product-slug">/{product.slug}</span>
                    </span>
                  </div>
                </th>
                <td data-label="Category">{product.category || <span className="muted">—</span>}</td>
                <td data-label="Price">{price || <span className="muted">Not set</span>}</td>
                <td data-label="Stock">
                  {product.stock_quantity === null || product.stock_quantity === undefined
                    ? <span className="muted">Not tracked</span>
                    : product.stock_quantity}
                </td>
                <td data-label="Availability">
                  <button
                    type="button"
                    className={`admin-badge ${product.is_available ? 'is-on' : 'is-off'}${availabilityLocked ? ' is-locked' : ''}`}
                    onClick={() => onToggleAvailable(product)}
                    disabled={isBusy || availabilityLocked}
                    aria-pressed={product.is_available}
                  >
                    {product.is_available ? 'Available' : 'Unavailable'}
                  </button>
                  {outOfStock ? (
                    <span className="admin-warn">
                      {product.is_available ? 'Stock is 0' : 'Stock is 0 — set a quantity above 0 to mark it available'}
                    </span>
                  ) : null}
                </td>
                <td data-label="Publication">
                  <button
                    type="button"
                    className={`admin-badge ${product.is_published ? 'is-on' : 'is-draft'}`}
                    onClick={() => onTogglePublished(product)}
                    disabled={isBusy}
                    aria-pressed={product.is_published}
                  >
                    {product.is_published ? 'Published' : 'Draft'}
                  </button>
                </td>
                <td data-label="Actions" className="admin-col-actions">
                  <div className="admin-row-actions">
                    <Link className="admin-link" to={`/admin/products/${product.id}/edit`}>Edit</Link>
                    <button
                      type="button"
                      className="admin-link admin-link-danger"
                      onClick={() => onDelete(product)}
                      disabled={isBusy}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
