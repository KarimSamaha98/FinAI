import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/Button'

const NAV_LINKS = [
  { to: '/accounts', label: 'Accounts' },
  { to: '/insights', label: 'Insights' },
  { to: '/settings', label: 'Settings' },
]

export function AppLayout() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className="app-header">
        <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'center' }}>
          <span className="app-logo">FinAI</span>
          <nav className="app-nav">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <Button variant="secondary" onClick={handleLogout}>
          Log out
        </Button>
      </header>
      <Outlet />
    </>
  )
}
