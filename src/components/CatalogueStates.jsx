import { CatalogueConfigurationError } from '../lib/products'

export function LoadingState({ label = 'Loading catalogue…' }) {
  return <p className="catalogue-state" role="status">{label}</p>
}

export function ErrorState({ error, onRetry }) {
  const needsSetup = error instanceof CatalogueConfigurationError
  const message = needsSetup
    ? 'The catalogue is being prepared. Please check back soon.'
    : 'We could not load the catalogue right now. Please try again.'

  return (
    <section className="catalogue-state error-state" aria-live="polite">
      <h2>Catalogue unavailable</h2>
      <p>{message}</p>
      {!needsSetup ? <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button> : null}
    </section>
  )
}

export function EmptyState({ children = 'No products have been published yet.' }) {
  return <section className="catalogue-state"><p>{children}</p></section>
}
