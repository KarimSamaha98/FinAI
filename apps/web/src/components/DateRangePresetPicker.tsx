import { useState } from 'react'
import { DateRangePicker, type DateRange } from './DateRangePicker'
import { DATE_RANGE_PRESET_LABELS, getPresetRange, type DateRangePreset } from '../lib/dateRangePresets'

interface DateRangePresetPickerProps {
  value: DateRange
  onChange: (value: DateRange) => void
}

export function DateRangePresetPicker({ value, onChange }: DateRangePresetPickerProps) {
  const [preset, setPreset] = useState<DateRangePreset>('current-month')

  function handlePresetChange(next: DateRangePreset) {
    setPreset(next)
    if (next !== 'custom') onChange(getPresetRange(next))
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label>
        Range
        <select value={preset} onChange={(e) => handlePresetChange(e.target.value as DateRangePreset)}>
          {(Object.keys(DATE_RANGE_PRESET_LABELS) as DateRangePreset[]).map((key) => (
            <option key={key} value={key}>
              {DATE_RANGE_PRESET_LABELS[key]}
            </option>
          ))}
        </select>
      </label>
      {preset === 'custom' && <DateRangePicker value={value} onChange={onChange} />}
    </div>
  )
}
