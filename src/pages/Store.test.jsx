import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import Store from './Store.jsx';
import { renderWithProviders, mockFetch, jsonResponse, API } from '../test/utils.jsx';

const PRODUCTS = 'GET /api/products';

const makeProduct = (over = {}) => ({
  id: 'sk1-chicago',
  name: 'Chicago',
  sku: 'AJ1-CHI',
  price: 180,
  image: 'https://example.com/chicago.png',
  colorway: 'Black/Red',
  tag: null,
  variants: [{ id: 1, product_id: 'sk1-chicago', size: '10', color: 'Black/Red', quantity: 5 }],
  ...over,
});

const renderStore = (route = '/store') =>
  renderWithProviders(<Store />, { route });

describe('loading', () => {
  it('shows six skeletons until the fetch resolves', () => {
    mockFetch({ [PRODUCTS]: () => new Promise(() => {}) });
    const { container } = renderStore();

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
  });

  it('requests the catalogue once', async () => {
    const fetchMock = mockFetch({ [PRODUCTS]: jsonResponse({ products: [makeProduct()] }) });
    renderStore();

    await screen.findByText('Chicago');
    // M5: one call for the whole page, not one per card.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/products`);
  });
});

describe('catalogue', () => {
  it('renders a card per product', async () => {
    mockFetch({
      [PRODUCTS]: jsonResponse({
        products: [
          makeProduct(),
          makeProduct({ id: 'sk4-bred', name: 'Bred', sku: 'AJ4-BRD' }),
        ],
      }),
    });
    renderStore();

    expect(await screen.findByText('Chicago')).toBeInTheDocument();
    expect(screen.getByText('Bred')).toBeInTheDocument();
  });

  it('shows the full-catalog heading with no tag', async () => {
    mockFetch({ [PRODUCTS]: jsonResponse({ products: [makeProduct()] }) });
    renderStore();

    await screen.findByText('Chicago');
    expect(screen.getByRole('heading', { name: 'The Store' })).toBeInTheDocument();
    expect(screen.getByText('Full Catalog')).toBeInTheDocument();
  });

  it('shows an empty state when the catalogue is empty', async () => {
    mockFetch({ [PRODUCTS]: jsonResponse({ products: [] }) });
    renderStore();

    expect(await screen.findByText('No products yet.')).toBeInTheDocument();
  });

  it('survives a malformed payload without crashing', async () => {
    mockFetch({ [PRODUCTS]: jsonResponse({}) });
    renderStore();

    expect(await screen.findByText('No products yet.')).toBeInTheDocument();
  });

  it('stops loading and logs when the request fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({ [PRODUCTS]: () => Promise.reject(new Error('offline')) });
    const { container } = renderStore();

    await waitFor(() => expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0));
    expect(screen.getByText('No products yet.')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});

describe('?tag= filtering', () => {
  const tagged = () => mockFetch({
    [PRODUCTS]: jsonResponse({
      products: [
        makeProduct({ id: 'a', name: 'Fresh One', tag: 'New' }),
        makeProduct({ id: 'b', name: 'Rare One', tag: 'Limited' }),
        makeProduct({ id: 'c', name: 'Plain One', tag: null }),
      ],
    }),
  });

  it('shows only products carrying the tag', async () => {
    tagged();
    renderStore('/store?tag=New');

    expect(await screen.findByText('Fresh One')).toBeInTheDocument();
    expect(screen.queryByText('Rare One')).not.toBeInTheDocument();
    expect(screen.queryByText('Plain One')).not.toBeInTheDocument();
  });

  it('matches the tag case-insensitively', async () => {
    tagged();
    renderStore('/store?tag=limited');

    expect(await screen.findByText('Rare One')).toBeInTheDocument();
  });

  it('titles the page with the tag and offers a way back', async () => {
    tagged();
    renderStore('/store?tag=New');

    await screen.findByText('Fresh One');
    expect(screen.getByRole('heading', { name: 'New' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /clear filter/i })).toHaveAttribute('href', '/store');
  });

  it('says so when nothing carries the tag', async () => {
    tagged();
    renderStore('/store?tag=Exclusive');

    expect(await screen.findByText('Nothing tagged “Exclusive” right now.')).toBeInTheDocument();
  });

  it('falls back to the full catalogue for a blank tag', async () => {
    tagged();
    renderStore('/store?tag=%20%20');

    // A bad URL degrades to the default view rather than an empty page.
    expect(await screen.findByText('Fresh One')).toBeInTheDocument();
    expect(screen.getByText('Rare One')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The Store' })).toBeInTheDocument();
  });
});
