import { CARD_COLOR_PALETTE } from 'shared-types'
import { AccountCardFace } from './AccountCardFace'

export const MAX_CARD_PHOTO_BYTES = 5 * 1024 * 1024
const CARD_PHOTO_TYPES = 'image/png,image/jpeg,image/webp'

interface CardAppearanceEditorProps {
  name: string
  color: string
  /** Uploaded photo URL or a local preview; when set it's shown instead of the colour. */
  photoUrl: string | null
  busy?: boolean
  onColorChange: (color: string) => void
  onPhotoSelected: (file: File) => void
  onRemovePhoto: () => void
}

/**
 * Card look picker shared by "New account" and account settings: a photo of
 * the physical card takes priority; the colour is used whenever there's no photo.
 */
export function CardAppearanceEditor({ name, color, photoUrl, busy, onColorChange, onPhotoSelected, onRemovePhoto }: CardAppearanceEditorProps) {
  const isCustomColor = !(CARD_COLOR_PALETTE as readonly string[]).includes(color)

  return (
    <div className="card-appearance">
      <AccountCardFace name={name || 'Account name'} color={color} photoUrl={photoUrl} className="card-appearance-preview" />

      <div className="card-appearance-actions">
        <label className={`btn btn-secondary${busy ? ' is-disabled' : ''}`}>
          {photoUrl ? 'Change card photo' : 'Upload card photo'}
          <input
            type="file"
            accept={CARD_PHOTO_TYPES}
            className="visually-hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onPhotoSelected(file)
              e.target.value = ''
            }}
          />
        </label>
        {photoUrl && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRemovePhoto}>
            Remove photo
          </button>
        )}
      </div>
      <p className="card-appearance-note">Cover your card number and security code before taking the photo.</p>

      <fieldset className="card-appearance-colors" disabled={busy}>
        <legend>{photoUrl ? 'Card colour (used if you remove the photo)' : 'Card colour'}</legend>
        <div className="card-appearance-swatches">
          {CARD_COLOR_PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`card-swatch${swatch === color ? ' is-selected' : ''}`}
              style={{ background: swatch }}
              aria-label={`Colour ${swatch}`}
              aria-pressed={swatch === color}
              onClick={() => onColorChange(swatch)}
            />
          ))}
          <label className={`card-swatch card-swatch-custom${isCustomColor ? ' is-selected' : ''}`} style={isCustomColor ? { background: color } : undefined}>
            <span aria-hidden="true">{isCustomColor ? '' : '+'}</span>
            <input
              type="color"
              aria-label="Custom colour"
              className="visually-hidden"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
            />
          </label>
        </div>
      </fieldset>
    </div>
  )
}
