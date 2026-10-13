import { useEffect, useRef, useState } from 'react'
import {
  IMAGE_ACCEPT_ATTRIBUTE,
  createProductWithUniqueSlug,
  deleteProductImageRow,
  describeDataError,
  getPrimaryImage,
  insertProductImageRow,
  removeStorageObjects,
  slugify,
  updateProduct,
  updateProductImageRow,
  uploadProductImage,
  validateImageFile,
} from '../../lib/adminProducts'

const CURRENCY_OPTIONS = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'AED', 'SGD']

export function initialFormValues(product) {
  return {
    name: product?.name ?? '',
    slug: product?.slug ?? '',
    description: product?.description ?? '',
    price: product?.price === null || product?.price === undefined ? '' : String(product.price),
    currency: product?.currency ?? 'INR',
    category: product?.category ?? '',
    stockQuantity:
      product?.stock_quantity === null || product?.stock_quantity === undefined ? '' : String(product.stock_quantity),
    isAvailable: product?.is_available ?? true,
    isFeatured: product?.is_featured ?? false,
    isPublished: product?.is_published ?? false,
  }
}

// Mirrors the database CHECK constraints so the owner gets a readable message
// instead of a raw constraint violation.
export function validate(values) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'Enter a product name.'

  const slug = values.slug.trim()
  if (!slug) errors.slug = 'Enter a URL slug.'
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    errors.slug = 'Use lower-case letters, numbers and single hyphens only (no leading, trailing or double hyphens).'
  }

  if (values.price.trim() !== '') {
    if (!/^\d+(\.\d{1,2})?$/.test(values.price.trim())) errors.price = 'Enter a non-negative amount with at most two decimals.'
  }

  if (!/^[A-Z]{3}$/.test(values.currency.trim().toUpperCase())) {
    errors.currency = 'Use a three-letter currency code such as INR.'
  }

  if (values.stockQuantity.trim() !== '') {
    const stock = Number(values.stockQuantity)
    if (!Number.isInteger(stock) || stock < 0) errors.stockQuantity = 'Enter a whole number of 0 or more.'
  }

  if (values.isAvailable && values.stockQuantity.trim() !== '' && Number(values.stockQuantity) === 0) {
    errors.isAvailable = 'Stock quantity is 0, so this product cannot be marked available. Increase stock or turn availability off.'
  }

  return errors
}

export function toPayload(values) {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    description: values.description.trim() || null,
    price: values.price.trim() === '' ? null : Number(values.price),
    currency: values.currency.trim().toUpperCase(),
    category: values.category.trim() || null,
    stock_quantity: values.stockQuantity.trim() === '' ? null : Number(values.stockQuantity),
    is_available: values.isAvailable,
    is_featured: values.isFeatured,
    is_published: values.isPublished,
  }
}

// Decides whether a submit should create a new product or update an existing one.
// In create mode a product that was already inserted on a previous attempt (but
// whose image step failed) is tracked so retrying updates it instead of inserting
// a second copy.
export function resolveSaveAction({ isEdit, existingId, createdId }) {
  const targetId = isEdit ? existingId : createdId
  return targetId ? { type: 'update', id: targetId } : { type: 'create' }
}

export default function ProductForm({ mode = 'create', initialProduct = null, onSaved, onCancel }) {
  const isEdit = mode === 'edit'
  const existingPrimary = getPrimaryImage(initialProduct)

  const [values, setValues] = useState(() => initialFormValues(initialProduct))
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [busyPhase, setBusyPhase] = useState('idle')
  const submittingRef = useRef(false)
  const createdProductIdRef = useRef(null)

  const [imageFile, setImageFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [imageError, setImageError] = useState(null)
  const [altText, setAltText] = useState(existingPrimary?.alt_text ?? '')

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null)
      return undefined
    }
    const objectUrl = URL.createObjectURL(imageFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [imageFile])

  function updateField(field, value) {
    setValues((previous) => ({ ...previous, [field]: value }))
  }

  function handleNameChange(event) {
    const name = event.target.value
    setValues((previous) => ({ ...previous, name, slug: slugTouched ? previous.slug : slugify(name) }))
  }

  function handleSlugChange(event) {
    setSlugTouched(true)
    updateField('slug', event.target.value.toLowerCase())
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setImageFile(null)
      return
    }
    const problem = validateImageFile(file)
    if (problem) {
      setImageError(problem)
      setImageFile(null)
      return
    }
    setImageError(null)
    setImageFile(file)
    setRemoveImage(false)
  }

  function handleRemoveImage() {
    setImageFile(null)
    setImageError(null)
    setRemoveImage(true)
  }

  async function applyImageChanges(productId) {
    const currentPrimary = getPrimaryImage(initialProduct)

    if (imageFile) {
      // Upload the object first, then write its row, so we never create a row
      // pointing at a missing object. On write failure, roll the object back.
      const path = await uploadProductImage(imageFile, productId)
      try {
        if (currentPrimary) {
          // Repoint the existing row so the product keeps exactly ONE image row
          // (MVP has a single primary image); the new path is unique.
          await updateProductImageRow(currentPrimary.id, { storage_path: path, alt_text: altText.trim() })
        } else {
          await insertProductImageRow({
            product_id: productId,
            storage_path: path,
            alt_text: altText.trim(),
            position: 0,
          })
        }
      } catch (error) {
        await removeStorageObjects([path]).catch(() => {})
        throw error
      }
      if (currentPrimary) {
        await removeStorageObjects([currentPrimary.storage_path]).catch(() => {})
      }
      return
    }

    if (removeImage && currentPrimary) {
      // Remove the database row first, then the object: a leftover object is a
      // harmless orphan, whereas a row without an object is broken.
      await deleteProductImageRow(currentPrimary.id)
      await removeStorageObjects([currentPrimary.storage_path]).catch(() => {})
      return
    }

    if (currentPrimary && altText.trim() !== (currentPrimary.alt_text ?? '')) {
      await updateProductImageRow(currentPrimary.id, { alt_text: altText.trim() })
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (submittingRef.current) return

    const nextErrors = validate(values)
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length > 0) return

    const imageProblem = validateImageFile(imageFile)
    if (imageProblem) {
      setImageError(imageProblem)
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setBusyPhase('saving')
    try {
      const payload = toPayload(values)
      const action = resolveSaveAction({
        isEdit,
        existingId: initialProduct?.id ?? null,
        createdId: createdProductIdRef.current,
      })
      const savedProduct = action.type === 'update'
        ? await updateProduct(action.id, payload)
        : await createProductWithUniqueSlug(payload)
      if (action.type === 'create') createdProductIdRef.current = savedProduct.id
      if (imageFile) setBusyPhase('uploading')
      await applyImageChanges(savedProduct.id)
      onSaved?.(savedProduct.id)
    } catch (error) {
      setFormError(describeDataError(error))
    } finally {
      // Reset regardless of outcome; on success the form usually unmounts via
      // navigation, and this stays harmless if onSaved ever does not navigate.
      submittingRef.current = false
      setSubmitting(false)
      setBusyPhase('idle')
    }
  }

  const submitLabel = submitting
    ? busyPhase === 'uploading' ? 'Uploading image…' : 'Saving…'
    : isEdit ? 'Save changes' : 'Create product'

  const previewSrc = previewUrl || (removeImage ? null : existingPrimary?.signedUrl ?? null)

  return (
    <form className="admin-form product-form" onSubmit={handleSubmit} noValidate>
      {formError ? (
        <p className="admin-banner is-error" role="alert">
          {formError}
        </p>
      ) : null}

      <fieldset className="admin-fieldset">
        <legend>Identity</legend>
        <label>
          <span>Product name *</span>
          <input type="text" value={values.name} onChange={handleNameChange} disabled={submitting} required />
          {errors.name ? <span className="field-error" role="alert">{errors.name}</span> : null}
        </label>
        <label>
          <span>URL slug *</span>
          <input type="text" value={values.slug} onChange={handleSlugChange} disabled={submitting} required />
          <span className="field-hint">Used in the product web address, e.g. /products/{values.slug || 'your-product'}</span>
          {errors.slug ? <span className="field-error" role="alert">{errors.slug}</span> : null}
        </label>
        <label>
          <span>Category</span>
          <input
            type="text"
            value={values.category}
            onChange={(event) => updateField('category', event.target.value)}
            disabled={submitting}
            placeholder="e.g. Remedies"
          />
        </label>
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Details</legend>
        <label>
          <span>Description</span>
          <textarea
            rows={5}
            value={values.description}
            onChange={(event) => updateField('description', event.target.value)}
            disabled={submitting}
          />
        </label>
        <div className="admin-field-row">
          <label>
            <span>Price</span>
            <input
              type="text"
              inputMode="decimal"
              value={values.price}
              onChange={(event) => updateField('price', event.target.value)}
              disabled={submitting}
              placeholder="Optional"
            />
            {errors.price ? <span className="field-error" role="alert">{errors.price}</span> : null}
          </label>
          <label>
            <span>Currency</span>
            <input
              type="text"
              value={values.currency}
              onChange={(event) => updateField('currency', event.target.value.toUpperCase())}
              disabled={submitting}
              maxLength={3}
              list="admin-currency-options"
            />
            <datalist id="admin-currency-options">
              {CURRENCY_OPTIONS.map((code) => <option key={code} value={code} />)}
            </datalist>
            {errors.currency ? <span className="field-error" role="alert">{errors.currency}</span> : null}
          </label>
        </div>
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Inventory &amp; visibility</legend>
        <label>
          <span>Stock quantity</span>
          <input
            type="text"
            inputMode="numeric"
            value={values.stockQuantity}
            onChange={(event) => updateField('stockQuantity', event.target.value)}
            disabled={submitting}
            placeholder="Optional — leave blank if not tracked"
          />
          {errors.stockQuantity ? <span className="field-error" role="alert">{errors.stockQuantity}</span> : null}
        </label>
        <div className="admin-checkbox-grid">
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={values.isAvailable}
              onChange={(event) => updateField('isAvailable', event.target.checked)}
              disabled={submitting}
            />
            <span>Available for customers</span>
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={values.isFeatured}
              onChange={(event) => updateField('isFeatured', event.target.checked)}
              disabled={submitting}
            />
            <span>Featured on the home page</span>
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={values.isPublished}
              onChange={(event) => updateField('isPublished', event.target.checked)}
              disabled={submitting}
            />
            <span>Published (visible in the shop)</span>
          </label>
        </div>
        {errors.isAvailable ? <span className="field-error" role="alert">{errors.isAvailable}</span> : null}
        <p className="field-hint">
          A product appears in the public shop only when it is both published and available. Leave it as a draft to keep
          working on it.
        </p>
      </fieldset>

      <fieldset className="admin-fieldset">
        <legend>Primary image</legend>
        <div className="admin-image-field">
          <div className="admin-image-preview">
            {previewSrc ? (
              <img src={previewSrc} alt={altText || 'Selected product image preview'} />
            ) : (
              <span className="admin-thumb-placeholder">No image</span>
            )}
          </div>
          <div className="admin-image-controls">
            <label>
              <span>Choose image</span>
              <input type="file" accept={IMAGE_ACCEPT_ATTRIBUTE} onChange={handleImageChange} disabled={submitting} />
            </label>
            <label>
              <span>Alternative text</span>
              <input
                type="text"
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                disabled={submitting}
                placeholder="Describe the image for screen readers"
              />
            </label>
            {previewSrc ? (
              <button type="button" className="button button-secondary" onClick={handleRemoveImage} disabled={submitting}>
                Remove image
              </button>
            ) : null}
            <p className="field-hint">JPEG, PNG or WebP, up to 5 MB. A private bucket serves images through signed links.</p>
            {imageError ? <span className="field-error" role="alert">{imageError}</span> : null}
          </div>
        </div>
      </fieldset>

      <p className="sr-only" role="status" aria-live="polite">{submitting ? submitLabel : ''}</p>

      <div className="admin-form-actions">
        <button className="button" type="submit" disabled={submitting} aria-busy={submitting}>
          {submitLabel}
        </button>
        <button className="button button-secondary" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}
