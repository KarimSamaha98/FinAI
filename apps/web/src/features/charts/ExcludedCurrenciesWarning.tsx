import { Link } from 'react-router-dom'
import type { ExcludedCurrency } from 'shared-types'
import { Alert } from '../../components/Alert'

interface ExcludedCurrenciesWarningProps {
  excludedCurrencies: ExcludedCurrency[]
}

export function ExcludedCurrenciesWarning({ excludedCurrencies }: ExcludedCurrenciesWarningProps) {
  if (!excludedCurrencies.length) return null

  return (
    <Alert variant="error">
      {excludedCurrencies.map(({ currencyCode, transactionCount }) => (
        <p key={currencyCode} style={{ margin: 0 }}>
          {transactionCount} transaction{transactionCount === 1 ? '' : 's'} in {currencyCode} excluded — no exchange
          rate set. <Link to="/settings">Add one in Settings.</Link>
        </p>
      ))}
    </Alert>
  )
}
