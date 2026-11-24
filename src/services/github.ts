export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

const STORAGE_KEY = 'smokk_github_media_cfg_v1';

export type MediaFolder = 'musica' | 'video' | 'imagenes' | 'galeria' | 'colabs' | 'artistas';

/**
 * Attempts to detect owner/repo automatically when running on *.github.io/<repo>.
 */
export function detectGitHubDefaults(): { owner: string; repo: string } {
  if (typeof window === 'undefined') return { owner: '', repo: '' };
  const host = window.location.hostname.toLowerCase();
  if (host.endsWith('.github.io')) {
    const owner = host.replace(/\.github\.io$/, '');
    const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] || '';
    const repo = firstSegment && firstSegment !== 'admin' ? firstSegment : `${owner}.github.io`;
    return { owner, repo };
  }
  return { owner: '', repo: '' };
}

export function loadGitHubConfig(): GitHubConfig {
  const defaults = detectGitHubDefaults();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { owner: defaults.owner, repo: defaults.repo, branch: 'main', token: '' };
    }
    const parsed = JSON.parse(raw) as Partial<GitHubConfig>;
    return {
      owner: String(parsed.owner ?? defaults.owner).trim(),
      repo: String(parsed.repo ?? defaults.repo).trim(),
      branch: String(parsed.branch || 'main').trim() || 'main',
      token: String(parsed.token || '').trim(),
    };
  } catch {
    return { owner: defaults.owner, repo: defaults.repo, branch: 'main', token: '' };
  }
}

export function saveGitHubConfig(cfg: GitHubConfig): void {
  const clean: GitHubConfig = {
    owner: cfg.owner.trim(),
    repo: cfg.repo.trim(),
    branch: cfg.branch.trim() || 'main',
    token: cfg.token.trim(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

export function isGitHubReady(cfg: GitHubConfig): boolean {
  return Boolean(cfg.owner.trim() && cfg.repo.trim() && cfg.token.trim());
}

function sanitizeFileName(name: string, fallbackExt: string): string {
  const dotIdx = name.lastIndexOf('.');
  const rawBase = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const rawExt = dotIdx > 0 ? name.slice(dotIdx + 1) : fallbackExt;

  const cleanBase = rawBase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'archivo';

  const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || fallbackExt;
  const stamp = Date.now().toString(36);
  return `${cleanBase}-${stamp}.${cleanExt}`;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(i + step, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export async function testGitHubConnection(cfg: GitHubConfig): Promise<{ ok: boolean; message: string }> {
  if (!isGitHubReady(cfg)) {
    return { ok: false, message: 'Completá usuario, repositorio y token de GitHub.' };
  }
  const owner = encodeURIComponent(cfg.owner.trim());
  const repo = encodeURIComponent(cfg.repo.trim());
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${cfg.token.trim()}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      return { ok: false, message: 'Token de GitHub inválido o vencido.' };
    }
    if (res.status === 404) {
      return { ok: false, message: 'Repositorio no encontrado o sin permisos de acceso.' };
    }
    return { ok: false, message: `GitHub respondió error ${res.status}.` };
  }

  const data = (await res.json()) as { permissions?: { push?: boolean }; default_branch?: string };
  if (data.permissions && data.permissions.push === false) {
    return {
      ok: false,
      message: 'El token solo tiene lectura. Habilitá permiso "Contents: Read and write".',
    };
  }

  return {
    ok: true,
    message: `Conectado correctamente a ${cfg.owner}/${cfg.repo} (rama ${cfg.branch || data.default_branch || 'main'}).`,
  };
}

export interface GitHubUploadResult {
  /** Relative path served by GitHub Pages & custom domain, e.g. /material/uploads/musica/tema-abc.mp3 */
  publicPath: string;
  /** Repo file path inside GitHub, e.g. public/material/uploads/musica/tema-abc.mp3 */
  repoPath: string;
  /** File name stored in GitHub */
  fileName: string;
}

/**
 * Uploads a binary asset (MP3, MP4, or optimized image) directly into
 * `public/material/uploads/<folder>/` in the user's GitHub repository.
 * Zero bytes of binary data are sent to Firebase Firestore.
 */
export async function uploadFileToGitHub(
  file: File,
  folder: MediaFolder,
  cfg: GitHubConfig,
  maxBytes = 24 * 1024 * 1024
): Promise<GitHubUploadResult> {
  if (!isGitHubReady(cfg)) {
    throw new Error(
      'Conectá primero tu repositorio de GitHub arriba en el panel (usuario, repo y token) para subir archivos directo a GitHub.'
    );
  }
  if (file.size === 0) {
    throw new Error('El archivo seleccionado está vacío.');
  }
  if (file.size > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new Error(
      `El archivo supera los ${mb} MB permitidos por la API de GitHub. Comprimilo o subilo directo desde tu compu a la carpeta public/material/uploads/${folder}/.`
    );
  }

  const fallbackExt =
    folder === 'musica' ? 'mp3' : folder === 'video' ? 'mp4' : 'webp';
  const fileName = sanitizeFileName(file.name, fallbackExt);
  const repoPath = `public/material/uploads/${folder}/${fileName}`;
  const publicPath = `/material/uploads/${folder}/${fileName}`;

  const owner = encodeURIComponent(cfg.owner.trim());
  const repo = encodeURIComponent(cfg.repo.trim());
  const branch = cfg.branch.trim() || 'main';
  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

  const contentBase64 = await fileToBase64(file);

  // Check if file already exists to supply its SHA for replacement
  let existingSha: string | undefined;
  const checkRes = await fetch(`${endpoint}?ref=${encodeURIComponent(branch)}`, {
    headers: {
      Authorization: `Bearer ${cfg.token.trim()}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (checkRes.ok) {
    const existing = (await checkRes.json()) as { sha?: string };
    existingSha = existing.sha;
  }

  const putRes = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token.trim()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `media: subir ${fileName} en ${folder}`,
      content: contentBase64,
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  if (!putRes.ok) {
    let detail = `Error ${putRes.status}`;
    try {
      const errJson = (await putRes.json()) as { message?: string };
      if (errJson.message) detail = errJson.message;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(`GitHub rechazó la subida: ${detail}`);
  }

  return { publicPath, repoPath, fileName };
}
