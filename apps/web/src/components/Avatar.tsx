interface AvatarProps {
  url: string | null
  name: string | null
  size: number
}

/** Round profile photo, falling back to the first initial (or a neutral dot) when there's no photo. */
export function Avatar({ url, name, size }: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (url) {
    return <img className="avatar" src={url} alt={name ? `${name}'s profile photo` : 'Profile photo'} style={style} />
  }
  return (
    <span className="avatar avatar-fallback" style={style} aria-hidden="true">
      {name?.trim().charAt(0).toUpperCase() || '•'}
    </span>
  )
}
