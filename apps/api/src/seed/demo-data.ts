import { randomUUID } from 'node:crypto'
import { format, startOfMonth, subMonths } from 'date-fns'
import type { AccountType, ColumnMapping } from 'shared-types'

/**
 * Deterministic demo dataset generator (see demo-seed.ts for the CLI that
 * inserts it). All randomness flows through one seeded PRNG created inside
 * buildDemoDataset, so every run produces the identical dataset. Dates are
 * anchored to "today" (rolling 12-month window) rather than fixed absolute
 * dates, so the data always lands inside the app's default date-range
 * presets — re-seeding on different days shifts the window but keeps the
 * shape; re-seeding on the same day is byte-for-byte identical.
 *
 * The GBP account deliberately has no FX rate to the home currency (USD), so
 * it exercises the "excluded from net worth" warnings on Home. The one
 * future-dated transaction exercises the hero-vs-series difference (the
 * point-in-time net worth includes it; the series does not).
 */

/** Preset category names this generator references — seed.sql must have run. */
export const REQUIRED_PRESET_CATEGORIES = [
  'Groceries',
  'Dining',
  'Rent',
  'Utilities',
  'Transport',
  'Salary',
  'Transfers',
  'Entertainment',
  'Health',
  'Shopping',
  'Travel',
  'Insurance',
  'Subscriptions',
  'Reimbursement',
  'Investment',
] as const

/** mulberry32 — tiny deterministic PRNG: same seed, same sequence, everywhere. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DemoAccount {
  id: string
  name: string
  type: AccountType
  institution: string | null
  currencyCode: string
  startingBalance: number
  balanceAsOf: string
}

export interface DemoTransaction {
  id: string
  accountId: string
  date: string
  amount: number
  currencyCode: string
  description: string
  /** Preset or custom category name — resolved to an id at insert time. */
  category: string | null
}

export interface DemoReconciliationGroup {
  id: string
  label: string | null
  transactionIds: string[]
}

export interface DemoMonthSplit {
  transactionId: string
  startMonth: string
  numMonths: number
}

export interface DemoImportProfile {
  id: string
  accountId: string
  name: string
  hasHeader: boolean
  delimiter: string
  dateFormat: string
  columnMapping: ColumnMapping
}

export interface DemoDataset {
  displayName: string
  accounts: DemoAccount[]
  customCategories: string[]
  fxRates: { baseCurrency: string; quoteCurrency: string; rate: number }[]
  transactions: DemoTransaction[]
  reconciliationGroups: DemoReconciliationGroup[]
  monthSplits: DemoMonthSplit[]
  importProfile: DemoImportProfile | null
}

const GROCERY_DESCRIPTIONS = ['Trader Joe\u2019s run', 'Whole Foods weekly shop', 'Safeway groceries', 'Costco haul'] as const
const DINING_DESCRIPTIONS = ['Lunch — Sweetgreen', 'Dinner — Ramen Nagi', 'Brunch — Cafe Luna', 'Dinner — Pizzeria Bianco', 'Takeout — Thai', 'Lunch — deli corner'] as const
const TRANSPORT_DESCRIPTIONS = ['Metro card top-up', 'Uber ride', 'Lyft — airport run', 'Gas station fill-up', 'Parking garage'] as const
const COFFEE_DESCRIPTIONS = ['Blue Bottle latte', 'Starbucks coffee', 'Corner cafe espresso', 'Drip coffee — office'] as const
const SHOPPING_DESCRIPTIONS = ['Amazon order', 'Uniqlo haul', 'IKEA trip', 'Best Buy — cables', 'Running shoes — Decathlon'] as const
const ENTERTAINMENT_DESCRIPTIONS = ['Cinema tickets', 'Concert — local band', 'Board game night', 'Museum entry'] as const
const HEALTH_DESCRIPTIONS = ['Pharmacy — basics', 'Dentist checkup', 'Physio session'] as const
const TRAVEL_DESCRIPTIONS = ['Flight — Lisbon', 'Hotel — Lisbon', 'Airbnb — weekend trip', 'Train tickets'] as const
const GADGET_DESCRIPTIONS = ['Mechanical keyboard', 'USB-C dock', 'Noise-cancelling earbuds', 'Standing-desk mat'] as const
const MONTHS_BACK = 12

export function buildDemoDataset(reference = new Date()): DemoDataset {
  const rng = mulberry32(1337)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]
  const times = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1))
  const money = (min: number, max: number): number => Math.round((min + rng() * (max - min)) * 100) / 100
  const iso = (d: Date): string => format(d, 'yyyy-MM-dd')

  /** ISO date `daysIn` months back; day capped at the month's end (and at today for the current month, so nothing is accidentally future-dated). */
  const dayInMonth = (monthsAgo: number, day: number): string => {
    const base = startOfMonth(subMonths(reference, monthsAgo))
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
    const capped = monthsAgo === 0 ? Math.min(day, reference.getDate(), lastDay) : Math.min(day, lastDay)
    return iso(new Date(base.getFullYear(), base.getMonth(), capped))
  }
  const monthLabel = (monthsAgo: number): string => format(subMonths(reference, monthsAgo), 'MMM yyyy')

  // 13 months back: every transaction in the 12-month window counts toward balances.
  const balanceAsOf = iso(subMonths(reference, 13))

  const checking: DemoAccount = {
    id: randomUUID(),
    name: 'Everyday Checking',
    type: 'checking',
    institution: 'Chase',
    currencyCode: 'USD',
    startingBalance: 2500,
    balanceAsOf,
  }
  const savings: DemoAccount = {
    id: randomUUID(),
    name: 'Online Savings',
    type: 'e_banking',
    institution: 'Ally',
    currencyCode: 'USD',
    startingBalance: 8000,
    balanceAsOf,
  }
  const visa: DemoAccount = {
    id: randomUUID(),
    name: 'Visa Platinum',
    type: 'credit',
    institution: 'Chase',
    currencyCode: 'USD',
    startingBalance: -450,
    balanceAsOf,
  }
  const brokerage: DemoAccount = {
    id: randomUUID(),
    name: 'Brokerage',
    type: 'investment',
    institution: 'Vanguard',
    currencyCode: 'USD',
    startingBalance: 12000,
    balanceAsOf,
  }
  const tfsa: DemoAccount = {
    id: randomUUID(),
    name: 'TFSA',
    type: 'investment',
    institution: 'Wealthsimple',
    currencyCode: 'CAD',
    // Born 6 months in — a visible "step" in the net-worth line at its starting balance.
    startingBalance: 6000,
    balanceAsOf: iso(subMonths(reference, 6)),
  }
  const eurWallet: DemoAccount = {
    id: randomUUID(),
    name: 'EUR Cash Wallet',
    type: 'cash',
    institution: null,
    currencyCode: 'EUR',
    startingBalance: 300,
    balanceAsOf,
  }
  const gbpLegacy: DemoAccount = {
    id: randomUUID(),
    name: 'Legacy GBP Account',
    type: 'other',
    institution: 'Barclays',
    currencyCode: 'GBP',
    startingBalance: 500,
    balanceAsOf,
  }
  const accounts: DemoAccount[] = [checking, savings, visa, brokerage, tfsa, eurWallet, gbpLegacy]

  const customCategories = ['Coffee', 'Gadgets']

  const fxRates = [
    { baseCurrency: 'EUR', quoteCurrency: 'USD', rate: 1.09 },
    { baseCurrency: 'CAD', quoteCurrency: 'USD', rate: 0.73 },
    // GBP intentionally missing — gbpLegacy exercises the excluded-account warning.
  ]

  const transactions: DemoTransaction[] = []
  const add = (
    account: DemoAccount,
    date: string,
    amount: number,
    description: string,
    category: string | null,
  ): DemoTransaction => {
    const t: DemoTransaction = { id: randomUUID(), accountId: account.id, date, amount, currencyCode: account.currencyCode, description, category }
    transactions.push(t)
    return t
  }

  // ── 12 months of recurring activity ─────────────────────────────────────
  for (let monthsAgo = MONTHS_BACK - 1; monthsAgo >= 0; monthsAgo--) {
    add(checking, dayInMonth(monthsAgo, 1), 5200, 'Salary — Acme Corp', 'Salary')
    add(checking, dayInMonth(monthsAgo, 2), -1800, 'Rent — 123 Main St', 'Rent')
    add(checking, dayInMonth(monthsAgo, times(5, 9)), -money(88, 165), 'Electricity bill', 'Utilities')
    add(checking, dayInMonth(monthsAgo, 8), -59.99, 'Fiber internet', 'Utilities')
    add(checking, dayInMonth(monthsAgo, 12), -45, 'Mobile plan', 'Utilities')
    add(checking, dayInMonth(monthsAgo, 3), -10.99, 'Spotify', 'Subscriptions')
    add(checking, dayInMonth(monthsAgo, 14), -15.49, 'Netflix', 'Subscriptions')
    add(checking, dayInMonth(monthsAgo, 18), -85, 'Car insurance', 'Insurance')

    // Groceries roughly every 10-16 days
    for (let day = times(2, 6); day <= 27; day += times(10, 16)) {
      add(checking, dayInMonth(monthsAgo, day), -money(45, 115), pick(GROCERY_DESCRIPTIONS), 'Groceries')
    }
    // Coffee (custom category)
    for (let i = 0, n = times(3, 6); i < n; i++) {
      add(checking, dayInMonth(monthsAgo, times(1, 27)), -money(4, 9), pick(COFFEE_DESCRIPTIONS), 'Coffee')
    }
    // Dining, split across checking and the credit card
    for (let i = 0, n = times(5, 8); i < n; i++) {
      const account = rng() < 0.55 ? checking : visa
      add(account, dayInMonth(monthsAgo, times(1, 27)), -money(12, 62), pick(DINING_DESCRIPTIONS), 'Dining')
    }
    // Transport
    for (let i = 0, n = times(3, 5); i < n; i++) {
      add(checking, dayInMonth(monthsAgo, times(1, 27)), -money(3, 28), pick(TRANSPORT_DESCRIPTIONS), 'Transport')
    }
    // Shopping, occasionally on the card
    for (let i = 0, n = times(1, 3); i < n; i++) {
      const account = rng() < 0.4 ? visa : checking
      add(account, dayInMonth(monthsAgo, times(1, 27)), -money(20, 180), pick(SHOPPING_DESCRIPTIONS), 'Shopping')
    }
    // Occasional entertainment / health
    if (rng() < 0.6) add(checking, dayInMonth(monthsAgo, times(1, 27)), -money(15, 70), pick(ENTERTAINMENT_DESCRIPTIONS), 'Entertainment')
    if (rng() < 0.35) add(checking, dayInMonth(monthsAgo, times(1, 27)), -money(20, 90), pick(HEALTH_DESCRIPTIONS), 'Health')

    // Monthly savings + brokerage transfers (out of checking, in at the destination)
    const savingsDate = dayInMonth(monthsAgo, 25)
    add(checking, savingsDate, -500, 'Savings transfer', 'Transfers')
    add(savings, savingsDate, 500, 'Savings transfer', 'Transfers')
    const brokerageDate = dayInMonth(monthsAgo, 27)
    add(checking, brokerageDate, -500, 'Brokerage transfer', 'Transfers')
    add(brokerage, brokerageDate, 500, 'Brokerage transfer', 'Transfers')

    // TFSA (CAD) — exists only from 6 months back
    if (monthsAgo <= 6) {
      add(tfsa, dayInMonth(monthsAgo, 5), 300, 'TFSA contribution', 'Investment')
    }
    if (monthsAgo === 5 || monthsAgo === 2) {
      add(tfsa, dayInMonth(monthsAgo, 20), 45.2, 'Dividend — Wealthsimple', 'Investment')
    }
  }

  // ── One-off events ─────────────────────────────────────────────────────
  // EUR trip on the cash wallet (multi-currency + FX in net worth)
  for (let i = 0; i < 6; i++) {
    add(eurWallet, dayInMonth(5, times(2, 25)), -money(15, 70), pick(DINING_DESCRIPTIONS), 'Dining')
  }
  // Trips on the card
  for (let i = 0; i < 3; i++) add(visa, dayInMonth(9, times(3, 24)), -money(180, 650), pick(TRAVEL_DESCRIPTIONS), 'Travel')
  for (let i = 0; i < 2; i++) add(visa, dayInMonth(5, times(2, 20)), -money(120, 400), pick(TRAVEL_DESCRIPTIONS), 'Travel')
  // Gadgets (custom category)
  add(visa, dayInMonth(8, times(5, 20)), -189.99, pick(GADGET_DESCRIPTIONS), 'Gadgets')
  add(visa, dayInMonth(2, times(5, 20)), -249, pick(GADGET_DESCRIPTIONS), 'Gadgets')
  // Annual insurance, month-split across 12 months (never reconciled — mutual exclusivity)
  const insurance = add(checking, dayInMonth(4, 20), -1200, 'Annual travel insurance', 'Insurance')
  const monthSplits: DemoMonthSplit[] = [
    { transactionId: insurance.id, startMonth: iso(startOfMonth(subMonths(reference, 4))), numMonths: 12 },
  ]
  // Future-dated reimbursement — included in the point-in-time net worth, excluded from the series
  add(checking, iso(subMonths(reference, -1)), 250, 'Tax refund — expected', 'Reimbursement')

  // ── Reconciliation groups ──────────────────────────────────────────────
  const byDescription = (description: string, monthsAgo: number): DemoTransaction[] =>
    transactions.filter((t) => t.description === description && t.date >= iso(startOfMonth(subMonths(reference, monthsAgo))) && t.date < iso(startOfMonth(subMonths(reference, monthsAgo - 1))))
  const group = (label: string | null, members: DemoTransaction[]): DemoReconciliationGroup => ({ id: randomUUID(), label, transactionIds: members.map((t) => t.id) })

  const reconciliationGroups: DemoReconciliationGroup[] = []
  // Shared dinner, net zero (paid 120, three friends repaid 40 each)
  const dinner = add(checking, dayInMonth(3, 14), -120, 'Dinner with Alex & Sam', 'Dining')
  const repayments = [
    add(checking, dayInMonth(3, 16), 40, 'Dinner repayment — Alex', 'Reimbursement'),
    add(checking, dayInMonth(3, 17), 40, 'Dinner repayment — Sam', 'Reimbursement'),
    add(checking, dayInMonth(3, 19), 40, 'Dinner repayment — Jordan', 'Reimbursement'),
  ]
  reconciliationGroups.push(group('Dinner with Alex & Sam', [dinner, ...repayments]))
  // Credit-card payment pair (cross-account)
  const cardPaymentOut = add(checking, dayInMonth(2, 22), -200, 'Visa payment', 'Transfers')
  const cardPaymentIn = add(visa, dayInMonth(2, 22), 200, 'Visa payment', 'Transfers')
  reconciliationGroups.push(group('Credit card payment', [cardPaymentOut, cardPaymentIn]))
  // The two most recent savings + brokerage transfer pairs
  for (const monthsAgo of [1, 0]) {
    reconciliationGroups.push(group(`Savings transfer — ${monthLabel(monthsAgo)}`, byDescription('Savings transfer', monthsAgo)))
    reconciliationGroups.push(group(`Brokerage transfer — ${monthLabel(monthsAgo)}`, byDescription('Brokerage transfer', monthsAgo)))
  }

  // ── One import profile, on the checking account ────────────────────────
  const columnMapping: ColumnMapping = {
    date: { type: 'name', value: 'Date' },
    description: { type: 'name', value: 'Description' },
    amount: { mode: 'single', column: { type: 'name', value: 'Amount' }, signConvention: 'positive_is_expense' },
    currency: { mode: 'fixed', code: 'USD' },
  }
  const importProfile: DemoImportProfile = {
    id: randomUUID(),
    accountId: checking.id,
    name: 'Chase checking export',
    hasHeader: true,
    delimiter: ',',
    dateFormat: 'yyyy-MM-dd',
    columnMapping,
  }

  return {
    displayName: 'Demo User',
    accounts,
    customCategories,
    fxRates,
    transactions,
    reconciliationGroups,
    monthSplits,
    importProfile,
  }
}
