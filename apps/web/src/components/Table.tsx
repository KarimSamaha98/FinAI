import type { HTMLAttributes, TdHTMLAttributes } from 'react'

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={['table', className].filter(Boolean).join(' ')} {...rest} />
}

export function TableRow({
  clickable,
  className,
  ...rest
}: HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean }) {
  return (
    <tr
      className={['table-row', clickable && 'table-row--clickable', className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}

export function TableCell({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={['table-cell', className].filter(Boolean).join(' ')} {...rest} />
}
