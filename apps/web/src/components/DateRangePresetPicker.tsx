import { useState } from 'react'
import { DateRangePicker, type DateRange } from './DateRangePicker'
import { SelectDropdown } from './SelectDropdown'
import { DATE_RANGE_PRESET_LABELS, getPresetRange, type DateRangePreset } from '../lib/dateRangePresets'

interface DateRangePresetPickerProps {
  value: DateRange
  onChange: (value: DateRange) => void
  /** Initial selection of the preset dropdown — keep it in sync with the caller's initial range. */
  defaultPreset?: DateRangePreset
}

export function DateRangePresetPicker({ value, onChange, defaultPreset = 'current-month' }: DateRangePresetPickerProps) {
  const [preset, setPreset] = useState<DateRangePreset>(defaultPreset)

  function handlePresetChange(next: DateRangePreset) {
    setPreset(next)
    if (next !== 'custom') onChange(getPresetRange(next))
  }

  return (
    <div className="filter-group">
      <SelectDropdown
        label="Range"
        value={preset}
        options={(Object.keys(DATE_RANGE_PRESET_LABELS) as DateRangePreset[]).map((key) => ({ value: key, label: DATE_RANGE_PRESET_LABELS[key] }))}
        onChange={handlePresetChange}
      />
      {preset === 'custom' && <DateRangePicker value={value} onChange={onChange} />}
    </div>
  )
}
