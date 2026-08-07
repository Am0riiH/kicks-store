import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminProducts from './AdminProducts.jsx';
import { renderWithProviders, mockFetch, jsonResponse, API } from '../test/utils.jsx';

/**
 * Two gotchas shape this file:
 *
 *  1. The form labels are not tied to inputs with htmlFor/id, so getByLabelText
 *     does not work for most fields. Queries go through the form element by
 *     position/type instead. The file input IS reachable, via its aria-label.
 *
 *  2. jsdom's window.confirm returns undefined (falsy), so both delete handlers
 *     silently no-op unless it is stubbed to true. That makes a delete test look
 *     like a bug in the component when it is really the environment.
 */

const PRODUCTS = 'GET /api/admin/products';
const AUTH = `Basic ${btoa('admin:secret')}`;

const makeProduct = (over = {}) => ({
  id: 'sk1-chicago',
  name: 'Chicago',
  colorway: 'Black/Red',
  category: 'High-Top',
  price: 180,
  sku: 'AJ1-CHI',
  tag: 'Limited',
  image: 'https://example.com/chicago.png',
  ...over,
});

const signedIn = () => sessionStorage.setItem('adminAuth', AUTH);
const renderPage = () => renderWithProviders(<AdminProducts />, { cart: false });

/** Field lookup by position, since labels are not associated with inputs. */
const form = () => document.querySelector('form.flex-col');
const fieldByType = (type, index = 0) =>
  form().querySelectorAll(`input[type="${type}"]`)[index];
const idField = () => fieldByType('text', 0);
const nameField = () => fieldByType('text', 1);
const colorwayField = () => fieldByType('text', 2);
const skuField = () => fieldByType('text', 3);
const priceField = () => form().querySelector('input[type="number"]');
const imageUrlField = () => form().querySelector('input[type="url"]');
const categorySelect = () => form().querySelector('select');

const listOnly = (products = [makeProduct()]) =>
  mockFetch({ [PRODUCTS]: jsonResponse({ products }) });

beforeEach(() => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('login form', () => {
  it('renders when there is no stored credential', () => {
    mockFetch({});
    renderPage();

    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
  });

  it('probes the products endpoint and stores the credential on success', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ [PRODUCTS]: jsonResponse({ products: [] }) });
    renderPage();

    await user.type(screen.getByPlaceholderText('Username'), 'admin');
    await user.type(screen.getByPlaceholderText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(sessionStorage.getItem('adminAuth')).toBe(AUTH));
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/admin/products`);
  });

  it('reports invalid credentials on a 401', async () => {
    const user = userEvent.setup();
    mockFetch({ [PRODUCTS]: jsonResponse({ error: 'nope' }, { status: 401 }) });
    renderPage();

    await user.type(screen.getByPlaceholderText('Username'), 'admin');
    await user.type(screen.getByPlaceholderText('Password'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(sessionStorage.getItem('adminAuth')).toBeNull();
  });
});

describe('product list', () => {
  beforeEach(signedIn);

  it('renders each product with its price formatted', async () => {
    listOnly();
    renderPage();

    expect(await screen.findByText('Chicago')).toBeInTheDocument();
    expect(screen.getByText('AJ1-CHI')).toBeInTheDocument();
    expect(screen.getByText('$180.00')).toBeInTheDocument();
    expect(screen.getByText('High-Top')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    listOnly([]);
    renderPage();

    expect(await screen.findByText('No products found')).toBeInTheDocument();
  });

  it('logs out silently on a 401', async () => {
    mockFetch({ [PRODUCTS]: jsonResponse({ error: 'nope' }, { status: 401 }) });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Admin Login' })).toBeInTheDocument();
    expect(sessionStorage.getItem('adminAuth')).toBeNull();
  });

  it('falls back to a dash for a missing colorway or tag', async () => {
    listOnly([makeProduct({ colorway: null, tag: null })]);
    renderPage();

    await screen.findByText('Chicago');
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });
});

describe('create', () => {
  beforeEach(signedIn);

  it('opens an empty form defaulting to Mid-Top', async () => {
    const user = userEvent.setup();
    listOnly();
    renderPage();

    await screen.findByText('Chicago');
    await user.click(screen.getByRole('button', { name: 'Add New Product' }));

    expect(screen.getByRole('heading', { name: 'Add New Product' })).toBeInTheDocument();
    expect(idField()).toHaveValue('');
    expect(categorySelect()).toHaveValue('Mid-Top');
    // The id is editable when creating.
    expect(idField()).toBeEnabled();
  });

  it('POSTs the form with price coerced to a number', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({
      [PRODUCTS]: jsonResponse({ products: [] }),
      'POST /api/admin/products': jsonResponse({ product: {} }, { status: 201 }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add New Product' }));

    await user.type(idField(), 'new-shoe');
    await user.type(nameField(), 'New Shoe');
    await user.type(colorwayField(), 'Blue');
    await user.type(priceField(), '99.99');
    await user.type(skuField(), 'NS-1');
    await user.type(imageUrlField(), 'https://example.com/new.png');
    await user.click(screen.getByRole('button', { name: 'Save Product' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
      expect(post).toBeDefined();
    });

    const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
    expect(post[0]).toBe(`${API}/api/admin/products`);
    expect(post[1].headers.Authorization).toBe(AUTH);

    const payload = JSON.parse(post[1].body);
    // The number input yields a string; the component must convert it or the
    // server's z.number() rejects the request.
    expect(payload.price).toBe(99.99);
    expect(typeof payload.price).toBe('number');
    expect(payload).toMatchObject({ id: 'new-shoe', name: 'New Shoe', sku: 'NS-1' });
  });

  it('closes the modal and refreshes the list on success', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({
      [PRODUCTS]: jsonResponse({ products: [] }),
      'POST /api/admin/products': jsonResponse({ product: {} }, { status: 201 }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add New Product' }));
    await user.type(idField(), 'x');
    await user.type(nameField(), 'X');
    await user.type(priceField(), '1');
    await user.type(skuField(), 'X-1');
    await user.type(imageUrlField(), 'https://example.com/x.png');
    await user.click(screen.getByRole('button', { name: 'Save Product' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Add New Product' })).not.toBeInTheDocument()
    );
    // Initial load + the POST + the refetch.
    expect(fetchMock.mock.calls.filter((c) => (c[1]?.method ?? 'GET') === 'GET')).toHaveLength(2);
  });

  it('closes without saving when Close is clicked', async () => {
    const user = userEvent.setup();
    listOnly();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add New Product' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('heading', { name: 'Add New Product' })).not.toBeInTheDocument();
  });
});

describe('save errors', () => {
  beforeEach(signedIn);

  const openFormAndSave = async (user) => {
    await user.click(await screen.findByRole('button', { name: 'Add New Product' }));
    await user.type(idField(), 'x');
    await user.type(nameField(), 'X');
    await user.type(priceField(), '1');
    await user.type(skuField(), 'X-1');
    await user.type(imageUrlField(), 'https://example.com/x.png');
    await user.click(screen.getByRole('button', { name: 'Save Product' }));
  };

  it('surfaces the field names from a Zod validation failure', async () => {
    const user = userEvent.setup();
    mockFetch({
      [PRODUCTS]: jsonResponse({ products: [] }),
      'POST /api/admin/products': jsonResponse(
        {
          error: 'Validation Error',
          details: [{ path: ['price'], message: 'Expected number, received string' }],
        },
        { status: 400 }
      ),
    });
    renderPage();
    await openFormAndSave(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Validation Error — price: Expected number, received string');
    // The modal stays open so the admin can fix it.
    expect(screen.getByRole('heading', { name: 'Add New Product' })).toBeInTheDocument();
  });

  it('surfaces a plain server error', async () => {
    const user = userEvent.setup();
    mockFetch({
      [PRODUCTS]: jsonResponse({ products: [] }),
      'POST /api/admin/products': jsonResponse(
        { error: 'Could not save product: NOT NULL constraint failed: products.sku' },
        { status: 500 }
      ),
    });
    renderPage();
    await openFormAndSave(user);

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('NOT NULL constraint failed: products.sku');
  });

  it('falls back to the HTTP status when the body is unreadable', async () => {
    const user = userEvent.setup();
    mockFetch({
      [PRODUCTS]: jsonResponse({ products: [] }),
      'POST /api/admin/products': {
        ok: false, status: 502, json: async () => { throw new Error('not json'); },
      },
    });
    renderPage();
    await openFormAndSave(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (HTTP 502).');
  });

  it('re-enables the save button after a failure', async () => {
    const user = userEvent.setup();
    mockFetch({
      [PRODUCTS]: jsonResponse({ products: [] }),
      'POST /api/admin/products': jsonResponse({ error: 'nope' }, { status: 500 }),
    });
    renderPage();
    await openFormAndSave(user);

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Save Product' })).toBeEnabled();
  });
});

describe('edit', () => {
  beforeEach(signedIn);

  const openEdit = async (user) => {
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
  };

  it('prefills the form and locks the id', async () => {
    const user = userEvent.setup();
    listOnly();
    renderPage();
    await openEdit(user);

    expect(screen.getByRole('heading', { name: 'Edit Product' })).toBeInTheDocument();
    expect(idField()).toHaveValue('sk1-chicago');
    // The id is the primary key and cannot be changed by updateProduct.
    expect(idField()).toBeDisabled();
    expect(nameField()).toHaveValue('Chicago');
    expect(priceField()).toHaveValue(180);
  });

  it('PUTs to the id-scoped URL', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({
      [PRODUCTS]: jsonResponse({ products: [makeProduct()] }),
      'PUT /api/admin/products/sk1-chicago': jsonResponse({ success: true }),
    });
    renderPage();
    await openEdit(user);

    await user.clear(priceField());
    await user.type(priceField(), '210');
    await user.click(screen.getByRole('button', { name: 'Save Product' }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
    });

    const put = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(put[0]).toBe(`${API}/api/admin/products/sk1-chicago`);
    expect(JSON.parse(put[1].body).price).toBe(210);
  });

  it('shows the variants manager only when editing', async () => {
    const user = userEvent.setup();
    mockFetch({
      [PRODUCTS]: jsonResponse({ products: [makeProduct()] }),
      'GET /api/products/sk1-chicago/variants': jsonResponse({ variants: [] }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add New Product' }));
    expect(screen.queryByRole('heading', { name: 'Manage Variants' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await openEdit(user);

    expect(await screen.findByRole('heading', { name: 'Manage Variants' })).toBeInTheDocument();
  });

  it('loads the variants for the product being edited', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({
      [PRODUCTS]: jsonResponse({ products: [makeProduct()] }),
      'GET /api/products/sk1-chicago/variants': jsonResponse({
        variants: [{ id: 1, size: '10', color: 'Black/Red', quantity: 5, sku: 'V1' }],
      }),
    });
    renderPage();
    await openEdit(user);

    await screen.findByRole('heading', { name: 'Manage Variants' });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(
        (c) => String(c[0]) === `${API}/api/products/sk1-chicago/variants`
      )).toBe(true)
    );
  });
});

describe('delete', () => {
  beforeEach(signedIn);

  it('does nothing when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    // jsdom's confirm already returns undefined; make the intent explicit.
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = listOnly();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this product?');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
  });

  it('DELETEs and refreshes when confirmed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = mockFetch({
      [PRODUCTS]: jsonResponse({ products: [makeProduct()] }),
      'DELETE /api/admin/products/sk1-chicago': jsonResponse({ success: true }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE');
      expect(del).toBeDefined();
      expect(del[0]).toBe(`${API}/api/admin/products/sk1-chicago`);
      expect(del[1].headers.Authorization).toBe(AUTH);
    });
  });

  it('alerts when the delete fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockFetch({
      [PRODUCTS]: jsonResponse({ products: [makeProduct()] }),
      'DELETE /api/admin/products/sk1-chicago': jsonResponse({ error: 'nope' }, { status: 500 }),
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      'Error deleting product: Failed to delete product'
    ));
  });
});

describe('image upload', () => {
  beforeEach(signedIn);

  const jpeg = () => new File(['binary'], 'shoe.jpg', { type: 'image/jpeg' });

  const openCreateForm = async (user) => {
    await user.click(await screen.findByRole('button', { name: 'Add New Product' }));
  };

  const fileInput = () =>
    screen.getByLabelText('Choose product image from your device');

  it('rejects a non-image without any network call', async () => {
    // applyAccept:false is required — the input carries accept="image/*", and
    // userEvent honours it by dropping the file before the change event, so the
    // component's own validation would never run.
    const user = userEvent.setup({ applyAccept: false });
    const fetchMock = listOnly();
    renderPage();
    await openCreateForm(user);

    await user.upload(fileInput(), new File(['x'], 'notes.pdf', { type: 'application/pdf' }));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('That file is not an image. Choose a photo (JPEG, PNG or WebP).');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('upload-signature'))).toBe(false);
  });

  it('rejects an oversized image', async () => {
    const user = userEvent.setup();
    listOnly();
    renderPage();
    await openCreateForm(user);

    const big = new File(['x'], 'huge.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 12 * 1024 * 1024 });

    await user.upload(fileInput(), big);

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('That image is 12.0MB — the limit is 10.0MB. Pick a smaller photo.');
  });

  it('rejects an unsupported image format', async () => {
    const user = userEvent.setup();
    listOnly();
    renderPage();
    await openCreateForm(user);

    await user.upload(fileInput(), new File(['x'], 'old.tif', { type: 'image/tiff' }));

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('image/tiff images are not supported. Use JPEG, PNG or WebP.');
  });

  it('writes the returned Cloudinary URL into the image field', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'])));

    mockFetch({
      [PRODUCTS]: jsonResponse({ products: [] }),
      'GET /api/admin/upload-signature': jsonResponse({
        cloudName: 'c', apiKey: 'k', timestamp: 1, signature: 's', folder: 'products',
      }),
      'https://api.cloudinary.com/v1_1/c/image/upload': jsonResponse({
        secure_url: 'https://res.cloudinary.com/c/uploaded.jpg',
      }),
    });
    renderPage();
    await openCreateForm(user);

    await user.upload(fileInput(), jpeg());

    await waitFor(() =>
      expect(imageUrlField()).toHaveValue('https://res.cloudinary.com/c/uploaded.jpg')
    );
  });

  it('surfaces a 503 when Cloudinary is not configured', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'])));

    mockFetch({
      [PRODUCTS]: jsonResponse({ products: [] }),
      'GET /api/admin/upload-signature': jsonResponse(
        { error: 'Image upload is not configured.' }, { status: 503 }
      ),
    });
    renderPage();
    await openCreateForm(user);

    await user.upload(fileInput(), jpeg());

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Image upload is not configured.');
  });

  it('offers Remove image once a URL is present, and clears it', async () => {
    const user = userEvent.setup();
    listOnly();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(imageUrlField()).toHaveValue('https://example.com/chicago.png');

    await user.click(screen.getByRole('button', { name: 'Remove image' }));

    expect(imageUrlField()).toHaveValue('');
  });
});
