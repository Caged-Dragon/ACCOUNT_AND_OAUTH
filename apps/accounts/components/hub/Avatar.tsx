export function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img className="av" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  return <span className="av ph" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.45 }}>{name.slice(0, 1).toUpperCase()}</span>
}
