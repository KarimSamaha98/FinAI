import type { Category } from 'shared-types'
import { CategoryIcon } from './categoryIcons'
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
      options={categories.map((c) => ({ id: c.id, label: c.name, icon: <CategoryIcon name={c.icon} /> }))}
      selectedIds={selectedIds}
      onChange={onChange}
    />
  )
}
