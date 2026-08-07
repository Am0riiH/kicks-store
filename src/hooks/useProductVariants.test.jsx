import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useProductVariants } from './useProductVariants.js';
import { mockFetch, jsonResponse, API } from '../test/utils.jsx';

/**
 * The three-state `preloadedVariants` contract is what removed the N+1 on
 * /store, so each state gets an explicit test:
 *
 *   undefined → fetch (legacy callers)
 *   null      → wait, fire NO request
 *   Array     → use directly, never fetch
 */

const variant = (over = {}) => ({
  id: 1, product_id: 'p1', size: '10', color: 'Black', quantity: 5, ...over,
});

/**
 * IMPORTANT: preloaded variants must be a STABLE reference.
 *
 * The sync effect lists `preloadedVariants` in its dependency array and calls
 * setVariants with it, so a fresh array literal on every render re-fires the
 * effect forever. Callers pass `product.variants` straight off fetched state,
 * which is stable; tests must do the same or they hang the worker.
 *
 * These helpers build each fixture once, outside the render callback.
 */
const ONE = [variant()];
const EMPTY = [];
const TWO_COLOURS = [variant({ id: 1, color: 'Red' }), variant({ id: 2, color: 'Blue' })];

describe('preloadedVariants: undefined — fetches', () => {
  it('requests the variants endpoint for the product', async () => {
    const fetchMock = mockFetch({
      'GET /api/products/p1/variants': jsonResponse({ variants: [variant()] }),
    });

    const { result } = renderHook(() => useProductVariants('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/products/p1/variants`);
    expect(result.current.variants).toHaveLength(1);
  });

  it('starts in a loading state', () => {
    mockFetch({ 'GET /api/products/p1/variants': jsonResponse({ variants: [] }) });

    const { result } = renderHook(() => useProductVariants('p1'));

    expect(result.current.loading).toBe(true);
  });

  it('selects the first colour returned', async () => {
    mockFetch({
      'GET /api/products/p1/variants': jsonResponse({
        variants: [variant({ id: 1, color: 'Red' }), variant({ id: 2, color: 'Blue' })],
      }),
    });

    const { result } = renderHook(() => useProductVariants('p1'));

    await waitFor(() => expect(result.current.selectedColor).toBe('Red'));
  });

  it('stops loading and logs when the request fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({ 'GET /api/products/p1/variants': () => Promise.reject(new Error('offline')) });

    const { result } = renderHook(() => useProductVariants('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.variants).toEqual([]);
    expect(spy).toHaveBeenCalled();
  });

  it('does not fetch without a productId', () => {
    const fetchMock = mockFetch({});

    renderHook(() => useProductVariants(undefined));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('preloadedVariants: null — waits', () => {
  it('fires NO request while the parent is still loading (M5 regression)', () => {
    const fetchMock = mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', null));

    // This is the whole point of the null sentinel: ProductDetail passes null
    // until its own product fetch resolves. Firing here would double every
    // detail-page load.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.variants).toEqual([]);
  });

  it('adopts the variants once they arrive, still without fetching', async () => {
    const fetchMock = mockFetch({});
    const arrived = [variant({ id: 9, size: '11' })];

    const { result, rerender } = renderHook(
      ({ preloaded }) => useProductVariants('p1', preloaded),
      { initialProps: { preloaded: null } }
    );

    rerender({ preloaded: arrived });

    await waitFor(() => expect(result.current.variants).toHaveLength(1));
    expect(result.current.variants[0].id).toBe(9);
    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('preloadedVariants: array — uses directly', () => {
  it('never fetches', () => {
    const fetchMock = mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', ONE));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.variants).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it('is not loading on first render', () => {
    mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', ONE));

    expect(result.current.loading).toBe(false);
  });

  it('handles an empty array without fetching', () => {
    const fetchMock = mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', EMPTY));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.variants).toEqual([]);
    expect(result.current.isSoldOut).toBe(false);
  });

  it('keeps the selected colour when the array changes but the colour survives', async () => {
    mockFetch({});
    const next = [variant({ id: 3, color: 'Red' }), variant({ id: 4, color: 'Blue' })];

    const { result, rerender } = renderHook(
      ({ v }) => useProductVariants('p1', v),
      { initialProps: { v: TWO_COLOURS } }
    );

    act(() => result.current.setSelectedColor('Blue'));
    await waitFor(() => expect(result.current.selectedColor).toBe('Blue'));

    rerender({ v: next });

    await waitFor(() => expect(result.current.selectedColor).toBe('Blue'));
  });
});

describe('derived state', () => {
  const THREE_MIXED = [
    variant({ id: 1, color: 'Red', size: '9' }),
    variant({ id: 2, color: 'Red', size: '10' }),
    variant({ id: 3, color: 'Blue', size: '9' }),
  ];
  const TWO_SIZES_MIXED = [
    variant({ id: 1, color: 'Red', size: '9' }),
    variant({ id: 2, color: 'Blue', size: '10' }),
  ];
  const FIRST_SOLD_OUT = [
    variant({ id: 1, size: '9', quantity: 0 }),
    variant({ id: 2, size: '10', quantity: 3 }),
  ];
  const ALL_SOLD_OUT = [
    variant({ id: 1, size: '9', quantity: 0 }),
    variant({ id: 2, size: '10', quantity: 0 }),
  ];
  const SOME_LEFT = [
    variant({ id: 1, quantity: 0 }),
    variant({ id: 2, size: '11', quantity: 2 }),
  ];
  const COLOUR_SIZES = [
    variant({ id: 1, color: 'Red', size: '9' }),
    variant({ id: 2, color: 'Blue', size: '12' }),
  ];

  it('lists unique colours', () => {
    mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', THREE_MIXED));

    expect(result.current.availableColors).toEqual(['Red', 'Blue']);
  });

  it('filters sizes to the selected colour', () => {
    mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', TWO_SIZES_MIXED));

    expect(result.current.sizesForColor).toHaveLength(1);
    expect(result.current.sizesForColor[0].size).toBe('9');
  });

  it('auto-selects the first in-stock variant, skipping sold-out sizes', async () => {
    mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', FIRST_SOLD_OUT));

    await waitFor(() => expect(result.current.selectedVariant?.id).toBe(2));
  });

  it('falls back to the first size when every size is sold out', async () => {
    mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', ALL_SOLD_OUT));

    await waitFor(() => expect(result.current.selectedVariant?.id).toBe(1));
    expect(result.current.isSelectedVariantOut).toBe(true);
  });

  it('reports sold out only when every variant is at zero', () => {
    mockFetch({});

    const allOut = renderHook(() => useProductVariants('p1', ALL_SOLD_OUT));
    expect(allOut.result.current.isSoldOut).toBe(true);

    const someLeft = renderHook(() => useProductVariants('p1', SOME_LEFT));
    expect(someLeft.result.current.isSoldOut).toBe(false);
  });

  it('re-selects a variant when the colour changes', async () => {
    mockFetch({});

    const { result } = renderHook(() => useProductVariants('p1', COLOUR_SIZES));

    await waitFor(() => expect(result.current.selectedVariant?.color).toBe('Red'));

    act(() => result.current.setSelectedColor('Blue'));

    await waitFor(() => expect(result.current.selectedVariant?.color).toBe('Blue'));
    expect(result.current.selectedVariant.size).toBe('12');
  });
});
