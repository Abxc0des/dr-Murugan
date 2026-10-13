import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProductForm from '../../components/admin/ProductForm'
import { LoadingState } from '../../components/CatalogueStates'
import { describeDataError, getAdminProductById } from '../../lib/adminProducts'

function AdminFormShell({ title, subtitle, children }) {
  return (
    <div className="admin-shell page-width">
      <Link className="back-link" to="/admin">← Back to products</Link>
      <header className="admin-header admin-header-compact">
        <div>
          <p className="eyebrow">Private administration</p>
          <h1>{title}</h1>
          {subtitle ? <p className="admin-meta">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </div>
  )
}

export default function AdminProductFormPage({ mode }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = mode === 'edit'
  const [state, setState] = useState({ status: isEdit ? 'loading' : 'ready', product: null, error: null })

  useEffect(() => {
    if (!isEdit) return undefined
    let active = true
    setState({ status: 'loading', product: null, error: null })
    getAdminProductById(id)
      .then((product) => {
        if (!active) return
        if (!product) setState({ status: 'missing', product: null, error: null })
        else setState({ status: 'ready', product, error: null })
      })
      .catch((error) => {
        if (active) setState({ status: 'error', product: null, error: describeDataError(error) })
      })
    return () => {
      active = false
    }
  }, [id, isEdit])

  function handleSaved() {
    navigate('/admin', {
      replace: true,
      state: { adminMessage: isEdit ? 'Product updated.' : 'Product created.' },
    })
  }

  if (state.status === 'loading') {
    return (
      <AdminFormShell title={isEdit ? 'Edit product' : 'Add product'}>
        <LoadingState label="Loading product…" />
      </AdminFormShell>
    )
  }

  if (state.status === 'error') {
    return (
      <AdminFormShell title="Edit product">
        <section className="catalogue-state error-state" role="alert">
          <h2>Could not load product</h2>
          <p>{state.error}</p>
        </section>
      </AdminFormShell>
    )
  }

  if (state.status === 'missing') {
    return (
      <AdminFormShell title="Product not found">
        <section className="catalogue-state">
          <p>This product no longer exists or you do not have access to it.</p>
          <Link className="button" to="/admin">Back to products</Link>
        </section>
      </AdminFormShell>
    )
  }

  return (
    <AdminFormShell
      title={isEdit ? 'Edit product' : 'Add product'}
      subtitle={isEdit ? `Editing “${state.product.name}”.` : 'Create a draft, then publish it when it is ready.'}
    >
      <ProductForm
        mode={isEdit ? 'edit' : 'create'}
        initialProduct={state.product}
        onSaved={handleSaved}
        onCancel={() => navigate('/admin')}
      />
    </AdminFormShell>
  )
}
