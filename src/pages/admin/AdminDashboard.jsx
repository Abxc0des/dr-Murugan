import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import ProductTable from '../../components/admin/ProductTable'
import { LoadingState } from '../../components/CatalogueStates'
import {
  deleteProductById,
  describeDataError,
  getAdminProducts,
  removeStorageObjects,
  updateProduct,
} from '../../lib/adminProducts'

export default function AdminDashboard({ user, onSignOut }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState(null)
  const [banner, setBanner] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const loadProducts = useCallback(async (isActive = () => true) => {
    setStatus('loading')
    setLoadError(null)
    try {
      const data = await getAdminProducts()
      if (!isActive()) return
      setProducts(data)
      setStatus('success')
    } catch (error) {
      if (!isActive()) return
      setLoadError(describeDataError(error))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let active = true
    loadProducts(() => active)
    return () => {
      active = false
    }
  }, [loadProducts])

  // Show a one-shot message handed over from the form page, then clear it from
  // history so a reload does not repeat it.
  useEffect(() => {
    const message = location.state?.adminMessage
    if (message) {
      setBanner({ type: 'success', text: message })
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  async function toggleField(product, patch, successText) {
    setBusyId(product.id)
    setBanner(null)
    try {
      await updateProduct(product.id, patch)
      setProducts((previous) => previous.map((item) => (item.id === product.id ? { ...item, ...patch } : item)))
      setBanner({ type: 'success', text: successText })
    } catch (error) {
      setBanner({ type: 'error', text: describeDataError(error) })
    } finally {
      setBusyId(null)
    }
  }

  function handleTogglePublished(product) {
    const nextValue = !product.is_published
    toggleField(product, { is_published: nextValue }, nextValue ? 'Product published.' : 'Product unpublished (now a draft).')
  }

  function handleToggleAvailable(product) {
    if (!product.is_available && product.stock_quantity === 0) {
      // Never mark a product available while the data says it is out of stock.
      setBanner({ type: 'error', text: 'This product has 0 in stock. Set a stock quantity above 0 before marking it available.' })
      return
    }
    const nextValue = !product.is_available
    toggleField(product, { is_available: nextValue }, nextValue ? 'Product marked available.' : 'Product marked unavailable.')
  }

  async function handleConfirmDelete() {
    const product = pendingDelete
    if (!product) return
    setDeleting(true)
    const imagePaths = (product.product_images ?? []).map((image) => image.storage_path)
    try {
      // Delete the row first (cascades to product_images). Object cleanup runs
      // afterwards so a failure leaves a harmless orphan, never a broken row.
      await deleteProductById(product.id)
      setProducts((previous) => previous.filter((item) => item.id !== product.id))
      setPendingDelete(null)
      setBanner({ type: 'success', text: `Deleted “${product.name}”.` })
      try {
        await removeStorageObjects(imagePaths)
      } catch {
        setBanner({
          type: 'error',
          text: `“${product.name}” was deleted, but its image file could not be removed and can be cleaned up later.`,
        })
      }
    } catch (error) {
      setBanner({ type: 'error', text: describeDataError(error) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="admin-shell page-width">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Private administration</p>
          <h1>Products</h1>
          <p className="admin-meta">
            Signed in as <span className="admin-user">{user?.email ?? 'administrator'}</span>
          </p>
        </div>
        <div className="admin-header-actions">
          <Link className="button" to="/admin/products/new">Add product</Link>
          <button className="button button-secondary" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {banner ? (
        <p
          className={`admin-banner ${banner.type === 'error' ? 'is-error' : 'is-success'}`}
          role={banner.type === 'error' ? 'alert' : 'status'}
        >
          {banner.text}
        </p>
      ) : null}

      {status === 'loading' ? <LoadingState label="Loading products…" /> : null}

      {status === 'error' ? (
        <section className="catalogue-state error-state" role="alert">
          <h2>Could not load products</h2>
          <p>{loadError}</p>
          <button className="button button-secondary" type="button" onClick={() => loadProducts()}>Try again</button>
        </section>
      ) : null}

      {status === 'success' && products.length === 0 ? (
        <section className="catalogue-state">
          <h2>No products yet</h2>
          <p>Add your first product to start building the shop. It stays a draft until you publish it.</p>
          <Link className="button" to="/admin/products/new">Add your first product</Link>
        </section>
      ) : null}

      {status === 'success' && products.length > 0 ? (
        <ProductTable
          products={products}
          busyId={busyId}
          onTogglePublished={handleTogglePublished}
          onToggleAvailable={handleToggleAvailable}
          onDelete={setPendingDelete}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete product"
        description={
          pendingDelete
            ? `Delete “${pendingDelete.name}”? Its image will also be removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete product"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deleting) setPendingDelete(null)
        }}
      />
    </div>
  )
}
