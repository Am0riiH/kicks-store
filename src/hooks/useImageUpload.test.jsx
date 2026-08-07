import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useImageUpload, {
  validateFile, downscale, MAX_FILE_BYTES, MAX_EDGE,
} from './useImageUpload.js';
import { mockFetch, jsonResponse, API } from '../test/utils.jsx';

/**
 * downscale() cannot run unmodified under jsdom: getContext('2d') returns null
 * (node-canvas is not installed) and createImageBitmap does not exist. Both are
 * stubbed here so the network half of the hook is exercised for real, with the
 * image pipeline reduced to a predictable stand-in.
 */

const AUTH = 'Basic dGVzdDp0ZXN0';

const imageFile = (over = {}) => ({
  name: 'photo.jpg',
  type: 'image/jpeg',
  size: 1024 * 500,
  ...over,
});

/** Makes decode + canvas work: source is w x h, toBlob yields a fixed blob. */
function stubImagePipeline({ width = 2400, height = 1600, blob = new Blob(['x']) } = {}) {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })));

  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(blob));

  return { drawImage, close };
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

// ─── validateFile — pure, no DOM needed ──────────────────────────────────────

describe('validateFile', () => {
  it('accepts a normal JPEG', () => {
    expect(validateFile(imageFile())).toBeNull();
  });

  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif'])(
    'accepts %s',
    (type) => {
      expect(validateFile(imageFile({ type }))).toBeNull();
    }
  );

  it('rejects a missing file', () => {
    expect(validateFile(null)).toBe('No file selected.');
    expect(validateFile(undefined)).toBe('No file selected.');
  });

  it('rejects a non-image', () => {
    expect(validateFile(imageFile({ type: 'application/pdf' })))
      .toBe('That file is not an image. Choose a photo (JPEG, PNG or WebP).');
  });

  it('rejects a file with no type at all', () => {
    expect(validateFile(imageFile({ type: '' })))
      .toBe('That file is not an image. Choose a photo (JPEG, PNG or WebP).');
  });

  it('rejects an image format the browser cannot use', () => {
    expect(validateFile(imageFile({ type: 'image/tiff' })))
      .toBe('image/tiff images are not supported. Use JPEG, PNG or WebP.');
  });

  it('rejects a file over the size cap, reporting both sizes in MB', () => {
    expect(validateFile(imageFile({ size: 12 * 1024 * 1024 })))
      .toBe('That image is 12.0MB — the limit is 10.0MB. Pick a smaller photo.');
  });

  it('accepts a file exactly at the cap', () => {
    expect(validateFile(imageFile({ size: MAX_FILE_BYTES }))).toBeNull();
  });
});

// ─── downscale ───────────────────────────────────────────────────────────────

describe('downscale', () => {
  it('caps the long edge at MAX_EDGE and preserves the aspect ratio', async () => {
    stubImagePipeline({ width: 2400, height: 1600 });

    const result = await downscale(imageFile());

    expect(result.width).toBe(MAX_EDGE);
    expect(result.height).toBe(800);
  });

  it('scales by the taller edge for portrait photos', async () => {
    stubImagePipeline({ width: 1200, height: 3600 });

    const result = await downscale(imageFile());

    expect(result.height).toBe(MAX_EDGE);
    expect(result.width).toBe(400);
  });

  it('never upscales an image already under the cap', async () => {
    stubImagePipeline({ width: 400, height: 300 });

    const result = await downscale(imageFile());

    expect(result).toMatchObject({ width: 400, height: 300 });
  });

  it('releases the decoded bitmap', async () => {
    const { close } = stubImagePipeline();

    await downscale(imageFile());

    expect(close).toHaveBeenCalled();
  });

  it('throws a readable message when the browser cannot decode the file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('bad'); }));
    // The <img> fallback never fires onload in jsdom, so force the error path.
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('no url'); });

    await expect(downscale(imageFile())).rejects.toThrow(/could not be read by your browser/);
  });

  it('throws when the canvas produces no blob', async () => {
    stubImagePipeline();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));

    await expect(downscale(imageFile()))
      .rejects.toThrow('Could not process this image. Try a different photo.');
  });
});

// ─── the hook ────────────────────────────────────────────────────────────────

describe('useImageUpload', () => {
  const SIG = 'GET /api/admin/upload-signature';
  const CLOUDINARY = 'https://api.cloudinary.com/v1_1/test-cloud/image/upload';

  const signature = () => jsonResponse({
    cloudName: 'test-cloud', apiKey: 'key123', timestamp: 1700000000,
    signature: 'abc123', folder: 'products',
  });

  it('starts idle', () => {
    const { result } = renderHook(() => useImageUpload(AUTH));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.previewUrl).toBeNull();
  });

  it('returns the secure_url on success', async () => {
    stubImagePipeline();
    mockFetch({
      [SIG]: signature(),
      [CLOUDINARY]: jsonResponse({ secure_url: 'https://res.cloudinary.com/x/photo.jpg' }),
    });

    const { result } = renderHook(() => useImageUpload(AUTH));

    let url;
    await act(async () => { url = await result.current.upload(imageFile()); });

    expect(url).toBe('https://res.cloudinary.com/x/photo.jpg');
    expect(result.current.status).toBe('done');
    expect(result.current.error).toBeNull();
  });

  it('sends the admin auth header when requesting a signature', async () => {
    stubImagePipeline();
    const fetchMock = mockFetch({
      [SIG]: signature(),
      [CLOUDINARY]: jsonResponse({ secure_url: 'https://res.cloudinary.com/x/p.jpg' }),
    });

    const { result } = renderHook(() => useImageUpload(AUTH));
    await act(async () => { await result.current.upload(imageFile()); });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/api/admin/upload-signature`);
    expect(init.headers.Authorization).toBe(AUTH);
  });

  it('posts the signed fields to Cloudinary, not to our own server', async () => {
    stubImagePipeline();
    const fetchMock = mockFetch({
      [SIG]: signature(),
      [CLOUDINARY]: jsonResponse({ secure_url: 'https://res.cloudinary.com/x/p.jpg' }),
    });

    const { result } = renderHook(() => useImageUpload(AUTH));
    await act(async () => { await result.current.upload(imageFile()); });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(CLOUDINARY);
    expect(init.method).toBe('POST');

    const form = init.body;
    expect(form.get('api_key')).toBe('key123');
    expect(form.get('signature')).toBe('abc123');
    expect(form.get('folder')).toBe('products');
    expect(form.get('file')).toBeTruthy();
  });

  it('shows a preview of the downscaled image', async () => {
    stubImagePipeline();
    mockFetch({
      [SIG]: signature(),
      [CLOUDINARY]: jsonResponse({ secure_url: 'https://res.cloudinary.com/x/p.jpg' }),
    });

    const { result } = renderHook(() => useImageUpload(AUTH));
    await act(async () => { await result.current.upload(imageFile()); });

    expect(result.current.previewUrl).toBe('blob:preview-url');
  });

  it('rejects an invalid file before any request', async () => {
    const fetchMock = mockFetch({});
    const { result } = renderHook(() => useImageUpload(AUTH));

    let url;
    await act(async () => { url = await result.current.upload(imageFile({ type: 'video/mp4' })); });

    expect(url).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/not an image/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the server error when the signature request fails', async () => {
    stubImagePipeline();
    mockFetch({
      [SIG]: jsonResponse({ error: 'Image upload is not configured.' }, { status: 503 }),
    });

    const { result } = renderHook(() => useImageUpload(AUTH));

    let url;
    await act(async () => { url = await result.current.upload(imageFile()); });

    expect(url).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Image upload is not configured.');
  });

  it('falls back to the HTTP status when the signature error has no body', async () => {
    stubImagePipeline();
    mockFetch({
      [SIG]: { ok: false, status: 500, json: async () => { throw new Error('nope'); } },
    });

    const { result } = renderHook(() => useImageUpload(AUTH));
    await act(async () => { await result.current.upload(imageFile()); });

    expect(result.current.error).toBe('Could not start upload (HTTP 500).');
  });

  it('surfaces a Cloudinary rejection', async () => {
    stubImagePipeline();
    mockFetch({
      [SIG]: signature(),
      [CLOUDINARY]: jsonResponse(
        { error: { message: 'File size too large.' } },
        { status: 400 }
      ),
    });

    const { result } = renderHook(() => useImageUpload(AUTH));

    let url;
    await act(async () => { url = await result.current.upload(imageFile()); });

    expect(url).toBeNull();
    expect(result.current.error).toBe('File size too large.');
  });

  it('treats a 200 with no secure_url as a failure', async () => {
    stubImagePipeline();
    mockFetch({ [SIG]: signature(), [CLOUDINARY]: jsonResponse({ public_id: 'x' }) });

    const { result } = renderHook(() => useImageUpload(AUTH));

    let url;
    await act(async () => { url = await result.current.upload(imageFile()); });

    expect(url).toBeNull();
    expect(result.current.error).toBe('Upload failed. Please try again.');
  });

  it('reports a downscale failure without attempting an upload', async () => {
    stubImagePipeline();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(null));
    const fetchMock = mockFetch({});

    const { result } = renderHook(() => useImageUpload(AUTH));

    let url;
    await act(async () => { url = await result.current.upload(imageFile()); });

    expect(url).toBeNull();
    expect(result.current.error).toBe('Could not process this image. Try a different photo.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reset() clears status, error and preview', async () => {
    const fetchMock = mockFetch({});
    const { result } = renderHook(() => useImageUpload(AUTH));

    await act(async () => { await result.current.upload(imageFile({ type: 'video/mp4' })); });
    expect(result.current.status).toBe('error');

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.previewUrl).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('revokes the previous object URL when a second upload replaces it', async () => {
    stubImagePipeline();
    mockFetch({
      [SIG]: signature(),
      [CLOUDINARY]: jsonResponse({ secure_url: 'https://res.cloudinary.com/x/p.jpg' }),
    });

    const { result } = renderHook(() => useImageUpload(AUTH));
    await act(async () => { await result.current.upload(imageFile()); });
    await act(async () => { await result.current.upload(imageFile()); });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url');
  });

  it('revokes the outstanding object URL on unmount', async () => {
    stubImagePipeline();
    mockFetch({
      [SIG]: signature(),
      [CLOUDINARY]: jsonResponse({ secure_url: 'https://res.cloudinary.com/x/p.jpg' }),
    });

    const { result, unmount } = renderHook(() => useImageUpload(AUTH));
    await act(async () => { await result.current.upload(imageFile()); });

    URL.revokeObjectURL.mockClear();
    unmount();

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url'));
  });
});
