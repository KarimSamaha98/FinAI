import type { Category } from 'shared-types'
import { MultiSelectDropdown } from './MultiSelectDropdown'

interface CategoryMultiSelectProps {
  categories: Category[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function CategoryMultiSelect({ categories, selectedIds, onChange }: CategoryMultiSelectProps) {
  return (
    <MultiSelectDropdown
      label="Category"
      options={categories.map((c) => ({ id: c.id, label: c.name }))}
      selectedIds={selectedIds}
      onChange={onChange}
    />
  )
}
