import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { LoginPage } from '../features/auth/LoginPage'
import { HomeScreen } from '../features/home/HomeScreen'
import { AccountsScreen } from '../features/accounts/AccountsScreen'
import { AccountSettingsPage } from '../features/accounts/AccountSettingsPage'
import { ImportWizardPage } from '../features/import/ImportWizardPage'
import { ChartsPage } from '../features/charts/ChartsPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomeScreen /> },
          { path: 'accounts', element: <AccountsScreen /> },
          { path: 'import', element: <ImportWizardPage /> },
          { path: 'accounts/:id/import', element: <ImportWizardPage /> },
          { path: 'accounts/:id/settings', element: <AccountSettingsPage /> },
          { path: 'insights', element: <ChartsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
])
