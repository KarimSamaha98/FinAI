/**
 * The gradient every colour card is drawn with, built from the account's one
 * stored colour: lighter in the top-right corner, the colour itself through
 * the middle, a little darker bottom-left — where the card's name sits, so
 * white text keeps its contrast.
 */
export function cardBackground(color: string): string {
  return `linear-gradient(to bottom left, color-mix(in srgb, ${color} 72%, #ffffff) 0%, ${color} 50%, color-mix(in srgb, ${color} 78%, #000000) 100%)`
}
