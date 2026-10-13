export const CURRENCY_CODES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY']

/** CURRENCY_CODES as options for FieldSelect. */
export const CURRENCY_OPTIONS = CURRENCY_CODES.map((code) => ({ value: code, label: code }))
