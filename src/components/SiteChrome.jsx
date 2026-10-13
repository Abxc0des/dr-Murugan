import { Link, NavLink } from 'react-router-dom'
import { getWhatsAppNumber } from '../lib/config'

const navigation = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
]

export function Header() {
  return (
    <header className="site-header">
      <div className="page-width header-content">
        <Link className="wordmark" to="/" aria-label="DR.MURUGAN’s flower remedies home">
          DR.MURUGAN’s <span>flower remedies</span>
        </Link>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  const whatsappNumber = getWhatsAppNumber()

  return (
    <footer className="site-footer">
      <div className="page-width footer-content">
        <div>
          <p className="footer-wordmark">DR.MURUGAN’s flower remedies</p>
          <p className="footer-note">Product and contact details are added only after owner verification.</p>
        </div>
        <div className="footer-links" aria-label="Information links">
          <Link to="/privacy">Privacy draft</Link>
          <Link to="/terms">Terms draft</Link>
          <Link to="/shipping">Shipping draft</Link>
          <Link to="/returns">Returns draft</Link>
          {whatsappNumber ? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">WhatsApp</a> : null}
        </div>
      </div>
    </footer>
  )
}
