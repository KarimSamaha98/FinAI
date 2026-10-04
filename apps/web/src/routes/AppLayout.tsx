import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/Button'
import { Avatar } from '../components/Avatar'
import { useProfile } from '../hooks/useProfile'

const NAV_LINKS = [
  { to: '/accounts', label: 'Accounts' },
  { to: '/insights', label: 'Insights' },
  { to: '/settings', label: 'Settings' },
]

export function AppLayout() {
  const navigate = useNavigate()
  const { profile } = useProfile()

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
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <Link to="/settings" aria-label="Profile settings">
            <Avatar url={profile?.avatarUrl ?? null} name={profile?.displayName ?? null} size={36} />
          </Link>
          <Button variant="secondary" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>
      <Outlet />
    </>
  )
}
