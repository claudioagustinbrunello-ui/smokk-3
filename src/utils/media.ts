import { SCHEMA_LIMITS, TrackChunk } from '../types';

export function clampString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function sanitizeDocId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'doc';
  const rand = Math.random().toString(36).slice(2, 10);
  return `${cleanPrefix}_${Date.now()}_${rand}`.slice(0, 128);
}

export function isBase64DataUrl(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().startsWith('data:');
}

/**
 * Resolves a stored media reference (either external https:// URL or relative repo path
 * like `/material/uploads/...`) so it works on GitHub Pages subpaths and custom domains.
 */
export function resolveMediaUrl(value: string | undefined | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (
    raw.startsWith('https://') ||
    raw.startsWith('http://') ||
    raw.startsWith('blob:') ||
    raw.startsWith('data:')
  ) {
    return raw;
  }
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  const cleanPath = raw.replace(/^\/+/, '');
  return `${base}/${cleanPath}`;
}

export function safeExternalLink(value: string | undefined | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function getYoutubeId(value: string | undefined | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.slice(1).split('/')[0] || '';
    }
    const vParam = url.searchParams.get('v');
    if (vParam) return vParam;
    const parts = url.pathname.split('/').filter(Boolean);
    const embedIndex = parts.findIndex((p) => ['embed', 'shorts', 'live'].includes(p));
    return embedIndex >= 0 ? parts[embedIndex + 1] || '' : '';
  } catch {
    return '';
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Optimizes an image file to WebP/JPEG before uploading to GitHub so pages load fast on mobile.
 */
export async function optimizeImageForGitHub(file: File, maxDimension = 1400): Promise<File> {
  // Keep transparent PNGs as PNG or WebP (WebP supports alpha cleanly and is much lighter)
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      el.src = imageUrl;
    });

    let width = img.naturalWidth;
    let height = img.naturalHeight;
    if (width > maxDimension || height > maxDimension) {
      const scale = Math.min(maxDimension / width, maxDimension / height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const outputMime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    const ext = outputMime === 'image/webp' ? 'webp' : 'jpg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputMime, 0.85)
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagen';
    return new File([blob], `${baseName}.${ext}`, { type: outputMime });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function reassembleChunksToBlobUrl(chunks: TrackChunk[], mimeType: string): string {
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  const byteParts = sorted.map((chunk) => base64ToUint8Array(chunk.data));
  const totalLength = byteParts.reduce((acc, part) => acc + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of byteParts) {
    merged.set(part, offset);
    offset += part.length;
  }
  const blob = new Blob([merged], { type: mimeType || 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

export function assertNoBase64InFirestore(value: string, label: string): void {
  if (isBase64DataUrl(value)) {
    throw new Error(
      `Por seguridad de cuota, ${label} no se guarda en Firebase como base64. Subilo a GitHub o usá un enlace.`
    );
  }
}

export function assertWithinUrlLimit(value: string, limit = SCHEMA_LIMITS.mediaUrl): string {
  return clampString(value, limit);
}
