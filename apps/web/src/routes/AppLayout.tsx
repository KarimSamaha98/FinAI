import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/Button'
import { Avatar } from '../components/Avatar'
import { CloseIcon, HomeIcon, InsightsIcon, LogoutIcon, MenuIcon, SettingsIcon, TransactionIcon } from '../components/icons'
import { useProfile } from '../hooks/useProfile'

const NAV_LINKS = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/accounts', label: 'Transaction', icon: TransactionIcon },
  { to: '/insights', label: 'Insights', icon: InsightsIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

/**
 * Desktop/tablet: a fixed left rail. Phone widths: a top bar with a menu
 * button that slides the same rail in as a drawer (see .app-rail in CSS) —
 * closed by picking a page, the backdrop, the close button or Escape.
 */
export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { profile } = useProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const railRef = useRef<HTMLElement>(null)

  // Navigating closes the drawer.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    railRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
    menuButtonRef.current?.focus()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`app-shell${menuOpen ? ' is-menu-open' : ''}`}>
      <header className="app-topbar">
        <span className="app-logo">FinAI</span>
        <button
          ref={menuButtonRef}
          type="button"
          className="app-menu-button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="app-rail"
          onClick={() => setMenuOpen(true)}
        >
          <MenuIcon />
        </button>
      </header>

      {menuOpen && <div className="app-rail-backdrop" onClick={closeMenu} aria-hidden="true" />}

      <aside id="app-rail" ref={railRef} className="app-rail" aria-label="Main menu">
        <div className="app-rail-head">
          <span className="app-logo">FinAI</span>
          <button type="button" className="app-menu-button app-menu-close" aria-label="Close menu" onClick={closeMenu}>
            <CloseIcon />
          </button>
        </div>
        <nav className="app-rail-nav" aria-label="Primary">
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-label={label}
              className={({ isActive }) => `app-rail-link${isActive ? ' active' : ''}`}
            >
              <Icon />
              <span className="app-rail-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="app-rail-user">
          <Link to="/settings" aria-label="Profile settings" className="app-rail-avatar">
            <Avatar url={profile?.avatarUrl ?? null} name={profile?.displayName ?? null} size={36} />
          </Link>
          <Button variant="secondary" className="app-rail-logout" aria-label="Log out" onClick={handleLogout}>
            <LogoutIcon />
            <span className="app-rail-label">Log out</span>
          </Button>
        </div>
      </aside>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  )
}
