import { useState } from 'react'
import { LoadingState } from '../components/CatalogueStates'
import { AdminConfigurationError, signInAdmin, signOutAdmin } from '../lib/admin'
import { useAdminAuth } from '../lib/useAdminAuth'
import AdminRoutes from './admin/AdminRoutes'

export default function AdminSetupPage() {
  const { status, user, error, retryAuthorization, retrySession } = useAdminAuth()

  async function handleSignOut() {
    try {
      await signOutAdmin()
    } catch {
      // A transient sign-out error is not worth blocking the UI; the auth listener
      // reconciles the session state on its own.
    }
  }

  if (status === 'unconfigured') {
    return (
      <AdminPanel eyebrow="Private administration" title="Administration is not connected yet">
        <p>Add the Supabase project URL and publishable key to the environment, then reload this page.</p>
      </AdminPanel>
    )
  }

  if (status === 'loading') {
    return (
      <div className="page-width section">
        <LoadingState label="Restoring your session…" />
      </div>
    )
  }

  if (status === 'signed-out') {
    return <AdminSignIn />
  }

  if (status === 'checking') {
    return (
      <div className="page-width section">
        <LoadingState label="Checking administrator access…" />
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <AdminPanel eyebrow="Private administration" title="Access denied">
        <p>
          You are signed in as <span className="admin-user">{user?.email ?? 'this account'}</span>, but this account
          is not an administrator.
        </p>
        <p className="admin-meta">If you believe this is a mistake, ask the site owner to add your account.</p>
        <div className="admin-actions">
          <button className="button" type="button" onClick={handleSignOut}>Sign out</button>
        </div>
      </AdminPanel>
    )
  }

  if (status === 'error') {
    const authorizationFailed = error === 'authorization'
    return (
      <AdminPanel
        eyebrow="Private administration"
        title={authorizationFailed ? 'Could not confirm access' : 'Could not restore your session'}
      >
        <p>
          {authorizationFailed
            ? 'We could not reach the server to confirm your administrator access. This is usually a temporary connection problem, so you are not being treated as an administrator.'
            : 'We could not restore your saved session. Please sign in again.'}
        </p>
        <div className="admin-actions">
          {authorizationFailed ? (
            <>
              <button className="button" type="button" onClick={retryAuthorization}>Try again</button>
              <button className="button button-secondary" type="button" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <button className="button" type="button" onClick={retrySession}>Try again</button>
          )}
        </div>
      </AdminPanel>
    )
  }

  // status === 'authorized' — render the product-management area.
  return <AdminRoutes user={user} onSignOut={handleSignOut} />
}

function AdminPanel({ eyebrow, title, children }) {
  return (
    <section className="page-width section">
      <div className="admin-panel">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </div>
    </section>
  )
}

function AdminSignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError(null)

    if (!email.trim() || !password) {
      setFormError('Enter your email address and password.')
      return
    }

    setSubmitting(true)
    try {
      await signInAdmin(email.trim(), password)
      // On success the auth listener moves the gate to "checking"; this form unmounts.
    } catch (signInError) {
      setFormError(signInError instanceof AdminConfigurationError
        ? 'Administration is not connected yet.'
        : 'Those details were not accepted. Check your email and password and try again.')
      setSubmitting(false)
    }
  }

  return (
    <section className="page-width section">
      <div className="admin-panel">
        <p className="eyebrow">Private administration</p>
        <h1>Owner sign in</h1>
        <p className="admin-meta">Sign in with the owner account. There is no public administrator registration.</p>
        <form className="admin-form" onSubmit={handleSubmit} noValidate>
          <label>
            <span>Email address</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          {formError ? <p className="admin-form-error" role="alert">{formError}</p> : null}
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </section>
  )
}
