/**
 * Dev-only generator for CIBC-style credit-card statement CSVs, for
 * exercising the import flow against the demo user's "CIBC card export"
 * profile (or any profile with the same mapping). Emits the headerless
 * format the real exports use:
 *
 *   date,"description",expense,income,card#
 *
 * Purchases populate the expense column, payments/refunds the income column.
 *
 * Usage:
 *   pnpm generate:csv -- --rows 200 --out ~/Downloads/cibc-test.csv
 *   pnpm generate:csv -- --rows 50 --seed 42      # reproducible
 *   pnpm generate:csv -- --rows 10 --out -        # write to stdout
 */
import { writeFileSync } from 'node:fs'
import { format, subDays } from 'date-fns'

interface Args {
  rows: number
  /** null = default filename; '-' = stdout. */
  out: string | null
  seed: number
}

const STORED_MERCHANTS = [
  'COSTCO WHOLESALE W',
  'WMT SUPRCTR # ',
  'T&T SUPERMARKET #',
  'BULK BARN #',
  'SHOPPERS DRUG MART #',
  'LCBO #',
  'TIM HORTONS #',
  'CANADIAN TIRE #',
  'DOLLARAMA #',
  'LOBLAWS #',
  'METRO #',
  'STARBUCKS #',
  'PETRO-CANADA #',
] as const

const PLAIN_MERCHANTS = ['ONROUTE', 'THE CACTUS', 'UBER CANADA', 'AMAZON.CA', 'NETFLIX.COM', 'SPOTIFY', 'APPLE.COM/BILL'] as const
const CITIES = ['WATERLOO, ON', 'KITCHENER, ON', 'CAMBRIDGE, ON', 'GUELPH, ON', 'TORONTO, ON', 'MISSISSAUGA, ON'] as const
const CREDIT_DESCRIPTIONS = [
  'PAYMENT THANK YOU/PAIEMEN T MERCI',
  'PRE AUTHORIZED PAYMENT - THANK YOU',
  'REFUND - AMAZON.CA',
  'CASHBACK BONUS',
] as const

const CARD = '5268********5532'
const MAX_DAYS_BACK = 120
const CREDIT_RATIO = 0.12

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

function printHelp(): void {
  console.log(`Generate a CIBC-style statement CSV for import testing.

Options:
  -n, --rows <n>    number of transactions to generate (default 60)
  -o, --out <path>  output file (default ./cibc-<n>.csv; "-" for stdout)
  -s, --seed <n>    PRNG seed for a reproducible file (default: random)
  -h, --help        show this help

Example:
  pnpm generate:csv -- --rows 200 --out ~/Downloads/cibc-test.csv`)
}

function parseArgs(argv: string[]): Args {
  let rows = 60
  let out: string | null = null
  let seed = Date.now() >>> 0
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') continue // pnpm forwards its own separator through
    if (arg === '--rows' || arg === '-n') rows = Number(argv[++i])
    else if (arg === '--out' || arg === '-o') out = argv[++i] ?? null
    else if (arg === '--seed' || arg === '-s') seed = Number(argv[++i])
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument "${arg}" (try --help)`)
    }
  }
  if (!Number.isInteger(rows) || rows <= 0) throw new Error('--rows must be a positive integer')
  if (!Number.isFinite(seed)) throw new Error('--seed must be a number')
  return { rows, out, seed }
}

/** Quotes a field only when it contains a comma/quote, matching the source exports. */
function csvField(value: string): string {
  return /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function money(min: number, max: number, rnd: () => number): string {
  return (Math.round((min + rnd() * (max - min)) * 100) / 100).toFixed(2)
}

function generate({ rows, seed }: Args): { csv: string; expenses: number; credits: number } {
  const rnd = mulberry32(seed)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]
  const today = new Date()
  const lines: string[] = []
  const seen = new Set<string>()
  let expenses = 0
  let credits = 0

  while (lines.length < rows) {
    const isCredit = rnd() < CREDIT_RATIO
    const date = format(subDays(today, Math.floor(rnd() * MAX_DAYS_BACK)), 'yyyy-MM-dd')
    let description: string
    let expense = ''
    let income = ''

    if (isCredit) {
      description = pick(CREDIT_DESCRIPTIONS)
      income = money(50, 1500, rnd)
    } else {
      const merchant = rnd() < 0.6 ? `${pick(STORED_MERCHANTS)}${Math.floor(1000 + rnd() * 9000)}` : pick(PLAIN_MERCHANTS)
      description = `${merchant} ${pick(CITIES)}`
      expense = money(3, 350, rnd)
    }

    const amount = isCredit ? income : expense
    const key = `${date}|${description}|${amount}`
    if (seen.has(key)) continue // guarantee every generated row is unique
    seen.add(key)

    lines.push([date, csvField(description), expense, income, CARD].join(','))
    if (isCredit) credits++
    else expenses++
  }

  // Newest first, like the bank exports.
  lines.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  return { csv: `${lines.join('\n')}\n`, expenses, credits }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const { csv, expenses, credits } = generate(args)

  if (args.out === '-') {
    process.stdout.write(csv)
    return
  }
  const out = args.out ?? `cibc-${args.rows}.csv`
  writeFileSync(out, csv)
  console.log(`Wrote ${args.rows} transactions to ${out} (${expenses} purchases, ${credits} credits; seed ${args.seed}).`)
  console.log('Import it as the demo user (demo@finai.test), from the Everyday Checking account.')
}

main()
