// Strict same-origin validation for browser-initiated POST requests.
// A present Origin header always takes precedence; Referer is only a fallback
// for clients that genuinely omit Origin.
export function isSameOriginRequest({ origin, referer }, expectedOrigin) {
  let requestOrigin = null;

  if (origin !== undefined) {
    if (typeof origin !== 'string' || origin === 'null') return false;
    try {
      const parsed = new URL(origin);
      // Origin is serialized as an origin, not a URL with a path/query.
      if (parsed.origin !== origin) return false;
      requestOrigin = parsed.origin;
    } catch {
      return false;
    }
  } else if (typeof referer === 'string' && referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      return false;
    }
  }

  return requestOrigin === expectedOrigin;
}
