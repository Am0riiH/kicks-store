/**
 * Builds a resized thumbnail URL for a product image.
 *
 * The cart drawer previously did `${item.image}&w=80`, which silently assumed
 * every image URL already carried a query string. That held while every product
 * was a seeded Unsplash link (…?w=800&q=80), but broke as soon as the admin
 * upload feature started producing Cloudinary URLs, which have no query string:
 * the `&w=80` became part of the filename and the request returned 400.
 *
 * @param {string} url    absolute image URL
 * @param {number} width  target width in CSS pixels
 * @returns {string} a URL safe to put in an <img src>
 */
export function thumbUrl(url, width = 80) {
  if (typeof url !== 'string' || !url) return '';

  // data:/blob: URLs carry their own payload — appending anything corrupts them.
  if (/^(data|blob):/.test(url)) return url;

  // Cloudinary resizes through a path segment rather than a query parameter.
  // Injecting the transform after /upload/ also lets it negotiate WebP/AVIF
  // (f_auto) and pick a sensible quality (q_auto).
  const marker = '/upload/';
  const at = url.indexOf(marker);
  if (/^https?:\/\/res\.cloudinary\.com\//.test(url) && at !== -1) {
    const prefix = url.slice(0, at);
    const rest = url.slice(at + marker.length);
    // Leave it alone if a transform is already applied (e.g. w_400,c_fill/…),
    // otherwise we'd stack conflicting directives.
    if (/^(?:[a-z]{1,2}_[^/,]+,?)+\//.test(rest)) return url;
    return `${prefix}${marker}w_${width},c_fill,f_auto,q_auto/${rest}`;
  }

  // Everything else (Unsplash and any hand-pasted URL) takes a width query
  // param. Set rather than append: the seeded Unsplash URLs already carry
  // ?w=800, and a second `&w=80` was simply ignored in favour of the first —
  // so the old concatenation never actually saved any bandwidth.
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('w', String(width));
    return parsed.toString();
  } catch {
    // Relative or otherwise unparseable — fall back to plain concatenation.
    return url.includes('?') ? `${url}&w=${width}` : `${url}?w=${width}`;
  }
}
