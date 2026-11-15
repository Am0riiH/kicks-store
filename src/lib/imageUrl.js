export function thumbUrl(url, width = 80) {
  if (typeof url !== 'string' || !url) return '';

  if (/^(data|blob):/.test(url)) return url;

  const marker = '/upload/';
  const at = url.indexOf(marker);
  if (/^https?:\/\/res\.cloudinary\.com\//.test(url) && at !== -1) {
    const prefix = url.slice(0, at);
    const rest = url.slice(at + marker.length);

    if (/^(?:[a-z]{1,2}_[^/,]+,?)+\//.test(rest)) return url;
    return `${prefix}${marker}w_${width},c_fill,f_auto,q_auto/${rest}`;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('w', String(width));
    return parsed.toString();
  } catch {
    // Relative or otherwise unparseable — fall back to plain concatenation.
    return url.includes('?') ? `${url}&w=${width}` : `${url}?w=${width}`;
  }
}
