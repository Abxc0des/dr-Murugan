import { useCallback, useEffect, useState } from 'react'
import { getPublishedProducts } from './products'

export function useProducts() {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const loadProducts = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      setProducts(await getPublishedProducts())
      setStatus('success')
    } catch (loadError) {
      setError(loadError)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  return { products, status, error, retry: loadProducts }
}
