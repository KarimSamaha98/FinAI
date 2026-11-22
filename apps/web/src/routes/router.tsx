import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { LoginPage } from '../features/auth/LoginPage'
import { HomeScreen } from '../features/home/HomeScreen'
import { AccountsScreen } from '../features/accounts/AccountsScreen'
import { AccountSettingsPage } from '../features/accounts/AccountSettingsPage'
import { ChartsPage } from '../features/charts/ChartsPage'
import { InsightTransactionsPage } from '../features/charts/InsightTransactionsPage'
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
          // Importing is a wizard on the Transactions page now; old links land there.
          { path: 'import', element: <Navigate to="/accounts" replace /> },
          { path: 'accounts/:id/import', element: <Navigate to="/accounts" replace /> },
          { path: 'accounts/:id/settings', element: <AccountSettingsPage /> },
          { path: 'insights', element: <ChartsPage /> },
          // An Insights breakdown's "Show all": a sub-page with the same URL params.
          { path: 'insights/transactions', element: <InsightTransactionsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
])
