/**
 * How every colour card is drawn from the account's one stored colour, like a
 * real metal/plastic card: a soft sheen across the top-right, the colour
 * itself through the middle, a little darker bottom-left — where the card's
 * name sits, so white text keeps its contrast.
 */
export function cardBackground(color: string): string {
  const sheen = 'radial-gradient(120% 90% at 100% 0%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0) 55%)'
  const body = `linear-gradient(to bottom left, color-mix(in srgb, ${color} 84%, #ffffff) 0%, ${color} 50%, color-mix(in srgb, ${color} 70%, #000000) 100%)`
  return `${sheen}, ${body}`
}
