/**
 * Selection is a set of account ids, where the empty set means "every
 * account". From "every account", tapping a card narrows to just that card;
 * after that taps toggle cards in and out, and the selection falls back to
 * "every account" when it would become empty or would cover every card.
 */
export function nextAccountSelection(selectedIds: string[], clickedId: string, allIds: string[]): string[] {
  if (selectedIds.length === 0) return [clickedId]
  const next = selectedIds.includes(clickedId) ? selectedIds.filter((id) => id !== clickedId) : [...selectedIds, clickedId]
  return next.length === 0 || allIds.every((id) => next.includes(id)) ? [] : next
}
