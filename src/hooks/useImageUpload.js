import { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/* Raw file cap, checked BEFORE decoding — a modern phone photo is 3–8MB, so this
   leaves headroom while rejecting videos or absurd files outright. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EDGE = 1200;   // long-edge cap after downscale
const JPEG_QUALITY = 0.82;

/* Browsers cannot decode every format a file picker will offer (notably HEIC on
   desktop), but the picker itself is the wrong place to be strict — we validate
   here and fail with a readable message instead. */
const ALLOWED_TYPES = [
  'image/jpeg', 'image/pjpeg', 'image/png', 'image/webp',
  'image/gif', 'image/avif', 'image/heic', 'image/heif',
];

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function validateFile(file) {
  if (!file) return 'No file selected.';
  if (!file.type || !file.type.startsWith('image/')) {
    return 'That file is not an image. Choose a photo (JPEG, PNG or WebP).';
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `${file.type} images are not supported. Use JPEG, PNG or WebP.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `That image is ${formatMB(file.size)} — the limit is ${formatMB(MAX_FILE_BYTES)}. Pick a smaller photo.`;
  }
  return null;
}

/* createImageBitmap with imageOrientation:'from-image' applies the EXIF rotation
   tag, which is what stops portrait phone photos from coming out sideways. The
   <img> fallback covers browsers without it (Safari gained support late). */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through — most often an undecodable HEIC */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode-failed'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downscale(file) {
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error(
      'This image could not be read by your browser. iPhone HEIC photos often ' +
      'need to be exported as JPEG first.'
    );
  }

  const w = source.width;
  const h = source.height;
  if (!w || !h) throw new Error('This image could not be read by your browser.');

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));

  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (typeof source.close === 'function') source.close();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  );
  if (!blob) throw new Error('Could not process this image. Try a different photo.');

  return { blob, width: canvas.width, height: canvas.height };
}

/**
 * Picks an image from the device, downscales it, and uploads it straight to
 * Cloudinary using a signature minted by our admin API. The image never passes
 * through our own server.
 *
 * @param {string} authHeader Basic auth header for the admin API
 */
export default function useImageUpload(authHeader) {
  const [status, setStatus] = useState('idle'); // idle|compressing|uploading|done|error
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const previewRef = useRef(null);

  const setPreview = useCallback((url) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  }, []);

  // Release the last object URL when the form unmounts.
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const reset = useCallback(() => {
    setPreview(null);
    setStatus('idle');
    setError(null);
  }, [setPreview]);

  const upload = useCallback(async (file) => {
    const invalid = validateFile(file);
    if (invalid) {
      setError(invalid);
      setStatus('error');
      setPreview(null);
      return null;
    }

    setError(null);
    setStatus('compressing');

    let processed;
    try {
      processed = await downscale(file);
    } catch (err) {
      setError(err.message);
      setStatus('error');
      return null;
    }

    // Preview the DOWNSCALED result, so what the admin sees is what gets stored.
    setPreview(URL.createObjectURL(processed.blob));
    setStatus('uploading');

    try {
      const sigRes = await fetch(`${API_BASE}/api/admin/upload-signature`, {
        headers: { Authorization: authHeader },
      });
      if (!sigRes.ok) {
        const body = await sigRes.json().catch(() => ({}));
        throw new Error(body.error || `Could not start upload (HTTP ${sigRes.status}).`);
      }
      const { cloudName, apiKey, timestamp, signature, folder } = await sigRes.json();

      const form = new FormData();
      form.append('file', processed.blob);
      form.append('api_key', apiKey);
      form.append('timestamp', timestamp);
      form.append('signature', signature);
      form.append('folder', folder);

      const upRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: form,
      });
      const payload = await upRes.json().catch(() => ({}));
      if (!upRes.ok || !payload.secure_url) {
        throw new Error(payload?.error?.message || 'Upload failed. Please try again.');
      }

      setStatus('done');
      return payload.secure_url;
    } catch (err) {
      setError(err.message);
      setStatus('error');
      return null;
    }
  }, [authHeader, setPreview]);

  return { upload, reset, status, error, previewUrl };
}
