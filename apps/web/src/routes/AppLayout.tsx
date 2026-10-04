import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/Button'
import { HomeIcon, InsightsIcon, LogoutIcon, SettingsIcon, TransactionIcon } from '../components/icons'

const NAV_LINKS = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/accounts', label: 'Transaction', icon: TransactionIcon },
  { to: '/insights', label: 'Insights', icon: InsightsIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function AppLayout() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="app-rail">
        <span className="app-logo">FinAI</span>
        <nav className="app-rail-nav" aria-label="Primary">
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              // aria-label keeps the accessible name intact in the icon-only
              // mini rail, where the visible label span is display:none'd.
              aria-label={label}
              className={({ isActive }) => `app-rail-link${isActive ? ' active' : ''}`}
            >
              <Icon />
              <span className="app-rail-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <Button variant="secondary" className="app-rail-logout" aria-label="Log out" onClick={handleLogout}>
          <LogoutIcon />
          <span className="app-rail-label">Log out</span>
        </Button>
      </aside>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  )
}
