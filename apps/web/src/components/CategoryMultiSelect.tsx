import type { Category } from 'shared-types'
import { MultiSelectDropdown } from './MultiSelectDropdown'
import { categoryEmoji } from '../lib/categoryEmoji'

interface CategoryMultiSelectProps {
  categories: Category[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function CategoryMultiSelect({ categories, selectedIds, onChange }: CategoryMultiSelectProps) {
  return (
    <MultiSelectDropdown
      label="Category"
      options={categories.map((c) => ({ id: c.id, label: c.name, icon: categoryEmoji(c.name) }))}
      selectedIds={selectedIds}
      onChange={onChange}
    />
  )
}
