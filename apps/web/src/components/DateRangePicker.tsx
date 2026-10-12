import { DatePickerDropdown } from './DatePickerDropdown'

export interface DateRange {
  from?: string
  to?: string
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (value: DateRange) => void
}

/** From / To date dropdowns; each limits the other so the range can't run backwards. */
export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div className="filter-group">
      <DatePickerDropdown label="From" value={value.from} max={value.to} onChange={(from) => onChange({ ...value, from })} />
      <DatePickerDropdown label="To" value={value.to} min={value.from} onChange={(to) => onChange({ ...value, to })} />
    </div>
  )
}
