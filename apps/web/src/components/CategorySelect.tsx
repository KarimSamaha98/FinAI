import type { Category } from 'shared-types'

interface CategorySelectProps {
  categories: Category[]
  value: string | null
  onChange: (id: string | null) => void
}

export function CategorySelect({ categories, value, onChange }: CategorySelectProps) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Uncategorized</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  )
}
