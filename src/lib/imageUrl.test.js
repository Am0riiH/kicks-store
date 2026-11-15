import { describe, it, expect } from 'vitest';
import { thumbUrl } from './imageUrl.js';

describe('Cloudinary URLs', () => {
  it('injects the transform as a path segment after /upload/', () => {
    expect(
      thumbUrl('https://res.cloudinary.com/demo/image/upload/v123/products/shoe.jpg', 80)
    ).toBe(
      'https://res.cloudinary.com/demo/image/upload/w_80,c_fill,f_auto,q_auto/v123/products/shoe.jpg'
    );
  });

  it('honours a custom width', () => {
    expect(
      thumbUrl('https://res.cloudinary.com/demo/image/upload/v1/a.jpg', 400)
    ).toContain('w_400,c_fill,f_auto,q_auto');
  });

  it('never appends a query string that would 400', () => {
    const result = thumbUrl('https://res.cloudinary.com/demo/image/upload/v1/a.jpg', 80);

    expect(result).not.toContain('&w=');
    expect(result).not.toContain('?w=');
  });

  it('leaves a URL that already carries a transform untouched', () => {
    const already = 'https://res.cloudinary.com/demo/image/upload/w_400,c_fill/v1/a.jpg';

    expect(thumbUrl(already, 80)).toBe(already);
  });

  it('ignores a lookalike host that is not Cloudinary', () => {
    const other = 'https://cdn.example.com/image/upload/v1/a.jpg';

    expect(thumbUrl(other, 80)).toBe(
      'https://cdn.example.com/image/upload/v1/a.jpg?w=80'
    );
  });
});

describe('query-parameter URLs', () => {
  it('adds a width parameter when there is none', () => {
    expect(thumbUrl('https://example.com/shoe.png', 80)).toBe(
      'https://example.com/shoe.png?w=80'
    );
  });

  it('REPLACES an existing width rather than appending a second one', () => {
    const result = thumbUrl('https://images.unsplash.com/photo-1?w=800&q=80', 80);

    expect(result).toContain('w=80');
    expect(result).not.toContain('w=800');
    expect(result).toContain('q=80');
  });

  it('preserves other query parameters', () => {
    const result = thumbUrl('https://example.com/a.png?fm=webp&fit=crop', 120);

    expect(result).toContain('fm=webp');
    expect(result).toContain('fit=crop');
    expect(result).toContain('w=120');
  });
});

describe('URLs that must not be modified', () => {
  it.each([
    ['data', 'data:image/png;base64,iVBORw0KGgo='],
    ['blob', 'blob:http://localhost:5173/8f9a-1234'],
  ])('returns a %s: URL unchanged', (_label, url) => {
    expect(thumbUrl(url, 80)).toBe(url);
  });
});

describe('defensive handling', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a number', 42],
    ['an object', {}],
  ])('returns an empty string for %s', (_label, input) => {
    expect(thumbUrl(input, 80)).toBe('');
  });

  it('falls back to concatenation for an unparseable relative path', () => {
    expect(thumbUrl('/local/shoe.png', 80)).toBe('/local/shoe.png?w=80');
  });

  it('uses & when a relative path already has a query string', () => {
    expect(thumbUrl('/local/shoe.png?v=2', 80)).toBe('/local/shoe.png?v=2&w=80');
  });

  it('defaults to a width of 80', () => {
    expect(thumbUrl('https://example.com/a.png')).toContain('w=80');
  });
});
