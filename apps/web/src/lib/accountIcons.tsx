import type { ReactNode } from 'react'
import type { AccountType } from 'shared-types'
import { AccountIcon, BankIcon, CashIcon, CreditCardIcon, InvestmentIcon } from '../components/icons'

/** The glyph shown for an account, chosen by its type. */
export function accountTypeIcon(type: AccountType): ReactNode {
  switch (type) {
    case 'checking':
      return <BankIcon />
    case 'credit':
      return <CreditCardIcon />
    case 'investment':
      return <InvestmentIcon />
    case 'cash':
      return <CashIcon />
    default:
      return <AccountIcon />
  }
}
