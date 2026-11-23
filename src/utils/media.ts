import { SCHEMA_LIMITS, TrackChunk } from '../types';

export function clampString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function sanitizeDocId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'doc';
  const rand = Math.random().toString(36).slice(2, 10);
  return `${cleanPrefix}_${Date.now()}_${rand}`.slice(0, 128);
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

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(i + step, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
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

export async function splitBinaryFileToBase64Chunks(
  file: File,
  kindLabel = 'archivo'
): Promise<string[]> {
  if (file.size === 0) {
    throw new Error(`El ${kindLabel} está vacío.`);
  }
  if (file.size > SCHEMA_LIMITS.maxMp3Bytes) {
    throw new Error(
      `El ${kindLabel} supera el límite permitido de ${formatBytes(SCHEMA_LIMITS.maxMp3Bytes)}. Comprimilo e intentá de nuevo.`
    );
  }

  const buffer = await file.arrayBuffer();
  const fullBytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const step = SCHEMA_LIMITS.chunkRawBytes;

  for (let offset = 0; offset < fullBytes.length; offset += step) {
    const slice = fullBytes.subarray(offset, Math.min(offset + step, fullBytes.length));
    chunks.push(uint8ArrayToBase64(slice));
  }

  if (chunks.length > SCHEMA_LIMITS.maxChunks) {
    throw new Error(`El ${kindLabel} genera demasiados fragmentos (máx. 15 MB).`);
  }

  return chunks;
}

export async function splitAudioFileToBase64Chunks(file: File): Promise<string[]> {
  return splitBinaryFileToBase64Chunks(file, 'archivo de audio');
}

export function reassembleIndexedChunksToBlobUrl(
  chunks: Array<{ index: number; data: string }>,
  mimeType: string
): string {
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  const byteParts = sorted.map((chunk) => base64ToUint8Array(chunk.data));
  const totalLength = byteParts.reduce((acc, part) => acc + part.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of byteParts) {
    merged.set(part, offset);
    offset += part.length;
  }
  const blob = new Blob([merged], { type: mimeType || 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

export function reassembleChunksToBlobUrl(chunks: TrackChunk[], mimeType: string): string {
  return reassembleIndexedChunksToBlobUrl(chunks, mimeType || 'audio/mpeg');
}

/**
 * Compresses an uploaded image via canvas so it fits comfortably inside Firestore (< 500 KB).
 */
export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1400,
  maxChars = 520000
): Promise<string> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
      el.src = imageUrl;
    });

    const isPng = file.type === 'image/png';
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
    if (!ctx) {
      throw new Error('No se pudo inicializar el procesador de imagen.');
    }
    ctx.drawImage(img, 0, 0, width, height);

    const outputType = isPng ? 'image/webp' : 'image/jpeg';
    let quality = 0.86;
    let dataUrl = canvas.toDataURL(outputType, quality);

    while (dataUrl.length > maxChars && quality > 0.35) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL(outputType, quality);
    }

    if (dataUrl.length > maxChars) {
      const shrink = Math.sqrt(maxChars / dataUrl.length) * 0.9;
      canvas.width = Math.max(320, Math.round(width * shrink));
      canvas.height = Math.max(320, Math.round(height * shrink));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL(outputType, 0.78);
    }

    if (dataUrl.length > SCHEMA_LIMITS.imageDataUrl) {
      throw new Error('La imagen sigue siendo demasiado pesada. Probá con una más liviana.');
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
