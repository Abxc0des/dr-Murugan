import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="page-width section catalogue-state">
      <h1>Page not found</h1>
      <p>The page you requested is not available.</p>
      <Link className="button button-secondary" to="/">Return home</Link>
    </section>
  )
}
