export interface DateRange {
  from?: string
  to?: string
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (value: DateRange) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
      <label>
        From
        <input
          type="date"
          value={value.from ?? ''}
          onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={value.to ?? ''}
          onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
        />
      </label>
    </div>
  )
}
