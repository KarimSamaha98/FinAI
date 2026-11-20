import type { Category } from 'shared-types'
import { CategoryIcon } from './categoryIcons'
import { FieldSelect } from './FieldSelect'

interface CategorySelectProps {
  categories: Category[]
  value: string | null
  onChange: (id: string | null) => void
  'aria-label'?: string
  /** 'pill': a chip like the category pill on transaction cards (yellow while uncategorized). */
  variant?: 'field' | 'pill'
}

export function CategorySelect({ categories, value, onChange, 'aria-label': ariaLabel, variant = 'field' }: CategorySelectProps) {
  return (
    <FieldSelect
      value={value ?? ''}
      aria-label={ariaLabel}
      variant={variant === 'pill' ? 'pill' : 'default'}
      options={[
        { value: '', label: 'Uncategorized', icon: variant === 'pill' ? <CategoryIcon name={null} /> : undefined },
        ...categories.map((category) => ({ value: category.id, label: category.name, icon: <CategoryIcon name={category.icon} /> })),
      ]}
      onChange={(id) => onChange(id || null)}
    />
  )
}
