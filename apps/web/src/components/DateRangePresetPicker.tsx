import { DateRangePicker } from './DateRangePicker'
import { SelectDropdown } from './SelectDropdown'
import { DATE_RANGE_PRESET_LABELS, getPresetRange, type DateRangePreset, type RangeSelection } from '../lib/dateRangePresets'

interface DateRangePresetPickerProps {
  /** Controlled, so the label always matches the range (e.g. one restored from the URL). */
  value: RangeSelection
  onChange: (value: RangeSelection) => void
}

export function DateRangePresetPicker({ value, onChange }: DateRangePresetPickerProps) {
  function handlePresetChange(next: DateRangePreset) {
    // Custom starts from the range on screen, so the date fields aren't blank.
    onChange({ preset: next, range: next === 'custom' ? value.range : getPresetRange(next) })
  }

  return (
    <div className="filter-group">
      <SelectDropdown
        label="Range"
        value={value.preset}
        options={(Object.keys(DATE_RANGE_PRESET_LABELS) as DateRangePreset[]).map((key) => ({ value: key, label: DATE_RANGE_PRESET_LABELS[key] }))}
        onChange={handlePresetChange}
      />
      {value.preset === 'custom' && <DateRangePicker value={value.range} onChange={(range) => onChange({ preset: 'custom', range })} />}
    </div>
  )
}
