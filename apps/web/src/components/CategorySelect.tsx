import type { Category } from 'shared-types'
import { FieldSelect } from './FieldSelect'

interface CategorySelectProps {
  categories: Category[]
  value: string | null
  onChange: (id: string | null) => void
  'aria-label'?: string
}

export function CategorySelect({ categories, value, onChange, 'aria-label': ariaLabel }: CategorySelectProps) {
  return (
    <FieldSelect
      value={value ?? ''}
      aria-label={ariaLabel}
      options={[{ value: '', label: 'Uncategorized' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]}
      onChange={(id) => onChange(id || null)}
    />
  )
}
