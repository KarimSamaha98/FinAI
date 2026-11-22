import { useLayoutEffect, useRef, type HTMLAttributes } from 'react'

/**
 * The list around TransactionRows. Each row lays out its own grid, so on its
 * own a wider amount ("CA$1,300.00") would widen that row's amount column and
 * push its category icon out of line. This measures the widest amount in the
 * list and gives every row that same column (--txn-amount-col), so the
 * category icons form one straight column. Measured before paint, so nothing
 * jumps.
 */
export function TransactionList({ className, children, ...rest }: HTMLAttributes<HTMLUListElement>) {
  const ref = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    const list = ref.current
    if (!list) return
    const measure = () => {
      let widest = 0
      // Amounts are sized to their text (justify-self: end), so this is the text width.
      for (const amount of list.querySelectorAll<HTMLElement>('.txn-row-amount')) {
        widest = Math.max(widest, amount.getBoundingClientRect().width)
      }
      if (widest > 0) list.style.setProperty('--txn-amount-col', `max(6.5rem, ${Math.ceil(widest)}px)`)
      else list.style.removeProperty('--txn-amount-col')
    }
    measure()
    // The web font can arrive after first paint and change the widths.
    let active = true
    void document.fonts?.ready.then(() => {
      if (active) measure()
    })
    return () => {
      active = false
    }
  })

  return (
    <ul ref={ref} className={['txn-list', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </ul>
  )
}
