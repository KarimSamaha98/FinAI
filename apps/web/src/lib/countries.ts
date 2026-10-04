import { CURRENCY_CODES } from './currencies'

// ISO 3166-1 alpha-2 codes; display names come from the browser's Intl data
// so they're localized and we don't ship a hand-maintained name table.
const COUNTRY_CODES =
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(
    ' ',
  )

export interface Country {
  code: string
  name: string
}

let cached: Country[] | null = null

export function listCountries(): Country[] {
  if (!cached) {
    const names = new Intl.DisplayNames(undefined, { type: 'region' })
    cached = COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }
  return cached
}

const EUROZONE = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ')

/** The country's own currency, when it's one the app supports — used to pre-fill sign-up. */
export function defaultCurrencyFor(countryCode: string): string | null {
  const byCountry: Record<string, string> = { US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', JP: 'JPY' }
  const currency = byCountry[countryCode] ?? (EUROZONE.includes(countryCode) ? 'EUR' : null)
  return currency && CURRENCY_CODES.includes(currency) ? currency : null
}
