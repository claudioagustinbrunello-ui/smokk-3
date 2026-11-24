import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ADMIN_BOOTSTRAP_EMAILS, db, handleFirestoreError, OperationType } from '../firebase';
import {
  Collaboration,
  DEFAULT_SITE_CONFIG,
  GalleryItem,
  SCHEMA_LIMITS,
  SiteConfig,
  Track,
} from '../types';
import { clampString, isBase64DataUrl, sanitizeDocId } from '../utils/media';

// =========================================================================
// PUBLIC CACHE (REDUCES FIRESTORE READS BY >95% ON REFRESHES)
// =========================================================================
const PUBLIC_CACHE_KEY = 'smokk_public_cms_v2';
const PUBLIC_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface PublicSiteBundle {
  config: SiteConfig;
  tracks: Track[];
  gallery: GalleryItem[];
  collaborations: Collaboration[];
  savedAt: number;
}

export function clearPublicCmsCache(): void {
  try {
    window.localStorage.removeItem(PUBLIC_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function readPublicCmsCache(): PublicSiteBundle | null {
  try {
    const raw = window.localStorage.getItem(PUBLIC_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PublicSiteBundle>;
    if (!parsed || !parsed.config || !Array.isArray(parsed.tracks)) return null;
    return {
      config: parsed.config,
      tracks: parsed.tracks,
      gallery: Array.isArray(parsed.gallery) ? parsed.gallery : [],
      collaborations: Array.isArray(parsed.collaborations) ? parsed.collaborations : [],
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

function writePublicCmsCache(bundle: PublicSiteBundle): void {
  try {
    window.localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify(bundle));
  } catch {
    // ignore quota exceeded in localStorage
  }
}

// =========================================================================
// ADMIN CHECK
// =========================================================================
export async function checkIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  const email = user.email?.toLowerCase();
  if (email && ADMIN_BOOTSTRAP_EMAILS.some((allowed) => allowed.toLowerCase() === email)) {
    return true;
  }
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists() && snap.data()?.role === 'admin';
  } catch {
    return false;
  }
}

// =========================================================================
// SITE CONFIG (TEXTS, LINKS & LIGHTWEIGHT MEDIA PATHS ONLY)
// =========================================================================
export async function fetchSiteConfig(): Promise<SiteConfig> {
  const path = 'site_config/main';
  try {
    const snap = await getDoc(doc(db, 'site_config', 'main'));
    if (!snap.exists()) {
      return { ...DEFAULT_SITE_CONFIG };
    }
    const d = snap.data();
    return {
      artistName:
        typeof d.artistName === 'string' && d.artistName
          ? d.artistName
          : DEFAULT_SITE_CONFIG.artistName,
      heroEyebrow:
        typeof d.heroEyebrow === 'string' ? d.heroEyebrow : DEFAULT_SITE_CONFIG.heroEyebrow,
      introKicker:
        typeof d.introKicker === 'string' ? d.introKicker : DEFAULT_SITE_CONFIG.introKicker,
      introCaption:
        typeof d.introCaption === 'string' ? d.introCaption : DEFAULT_SITE_CONFIG.introCaption,
      youtubeUrl: typeof d.youtubeUrl === 'string' ? d.youtubeUrl : DEFAULT_SITE_CONFIG.youtubeUrl,
      spotifyUrl: typeof d.spotifyUrl === 'string' ? d.spotifyUrl : DEFAULT_SITE_CONFIG.spotifyUrl,
      instagramUrl:
        typeof d.instagramUrl === 'string' ? d.instagramUrl : DEFAULT_SITE_CONFIG.instagramUrl,
      contactLine:
        typeof d.contactLine === 'string' ? d.contactLine : DEFAULT_SITE_CONFIG.contactLine,
      featuredVideoUrl:
        typeof d.featuredVideoUrl === 'string'
          ? d.featuredVideoUrl
          : DEFAULT_SITE_CONFIG.featuredVideoUrl,
      featuredVideoTitle:
        typeof d.featuredVideoTitle === 'string'
          ? d.featuredVideoTitle
          : DEFAULT_SITE_CONFIG.featuredVideoTitle,
      featuredVideoDescription:
        typeof d.featuredVideoDescription === 'string'
          ? d.featuredVideoDescription
          : DEFAULT_SITE_CONFIG.featuredVideoDescription,
      bioLead: typeof d.bioLead === 'string' ? d.bioLead : DEFAULT_SITE_CONFIG.bioLead,
      bioBody1: typeof d.bioBody1 === 'string' ? d.bioBody1 : DEFAULT_SITE_CONFIG.bioBody1,
      bioBody2: typeof d.bioBody2 === 'string' ? d.bioBody2 : DEFAULT_SITE_CONFIG.bioBody2,
      bioCredits: typeof d.bioCredits === 'string' ? d.bioCredits : DEFAULT_SITE_CONFIG.bioCredits,
      portraitImage:
        typeof d.portraitImage === 'string' ? d.portraitImage : DEFAULT_SITE_CONFIG.portraitImage,
      backgroundImage:
        typeof d.backgroundImage === 'string'
          ? d.backgroundImage
          : DEFAULT_SITE_CONFIG.backgroundImage,
      backgroundVideoUrl:
        typeof d.backgroundVideoUrl === 'string'
          ? d.backgroundVideoUrl
          : DEFAULT_SITE_CONFIG.backgroundVideoUrl,
      isPublic: typeof d.isPublic === 'boolean' ? d.isPublic : true,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveSiteConfig(config: SiteConfig, uid: string): Promise<void> {
  const path = 'site_config/main';
  const ref = doc(db, 'site_config', 'main');
  const payload = {
    artistName: clampString(config.artistName || 'SMOKK', SCHEMA_LIMITS.artistName) || 'SMOKK',
    heroEyebrow: clampString(config.heroEyebrow, SCHEMA_LIMITS.heroEyebrow),
    introKicker: clampString(config.introKicker, SCHEMA_LIMITS.introKicker),
    introCaption: clampString(config.introCaption, SCHEMA_LIMITS.introCaption),
    youtubeUrl: clampString(config.youtubeUrl, SCHEMA_LIMITS.url),
    spotifyUrl: clampString(config.spotifyUrl, SCHEMA_LIMITS.url),
    instagramUrl: clampString(config.instagramUrl, SCHEMA_LIMITS.url),
    contactLine: clampString(config.contactLine, SCHEMA_LIMITS.contactLine),
    featuredVideoUrl: clampString(config.featuredVideoUrl, SCHEMA_LIMITS.url),
    featuredVideoTitle: clampString(config.featuredVideoTitle, SCHEMA_LIMITS.featuredVideoTitle),
    featuredVideoDescription: clampString(
      config.featuredVideoDescription,
      SCHEMA_LIMITS.featuredVideoDescription
    ),
    bioLead: clampString(config.bioLead, SCHEMA_LIMITS.bioLead),
    bioBody1: clampString(config.bioBody1, SCHEMA_LIMITS.bioBody1),
    bioBody2: clampString(config.bioBody2, SCHEMA_LIMITS.bioBody2),
    bioCredits: clampString(config.bioCredits, SCHEMA_LIMITS.bioCredits),
    portraitImage: clampString(config.portraitImage, SCHEMA_LIMITS.imageDataUrl),
    backgroundImage: clampString(config.backgroundImage, SCHEMA_LIMITS.imageDataUrl),
    backgroundVideoUrl: clampString(config.backgroundVideoUrl, SCHEMA_LIMITS.backgroundVideoUrl),
    isPublic: true,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
    clearPublicCmsCache();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// =========================================================================
// TRACKS (LIGHTWEIGHT GITHUB PATHS OR EXTERNAL MP3 URLS — ZERO CHUNKS)
// =========================================================================
function mapTrackDoc(id: string, d: Record<string, unknown>): Track {
  return {
    id,
    title: String(d.title || 'Sin título'),
    artist: String(d.artist || 'SMOKK'),
    sourceType: d.sourceType === 'url' ? 'url' : 'upload',
    audioUrl: String(d.audioUrl || ''),
    mimeType: String(d.mimeType || 'audio/mpeg'),
    fileName: String(d.fileName || ''),
    fileSize: typeof d.fileSize === 'number' ? d.fileSize : 0,
    chunkCount: typeof d.chunkCount === 'number' ? d.chunkCount : 0,
    order: typeof d.order === 'number' ? d.order : 0,
    isPublic: Boolean(d.isPublic),
    ownerId: String(d.ownerId || ''),
  };
}

export async function fetchPublicTracks(): Promise<Track[]> {
  const path = 'tracks';
  try {
    const q = query(collection(db, 'tracks'), where('isPublic', '==', true));
    const snap = await getDocs(q);
    // Only play lightweight URL/GitHub-hosted tracks on the public site (never read legacy binary chunks)
    return snap.docs
      .map((item) => mapTrackDoc(item.id, item.data()))
      .filter((t) => t.sourceType === 'url' && Boolean(t.audioUrl))
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAllTracksAdmin(): Promise<Track[]> {
  const path = 'tracks';
  try {
    const snap = await getDocs(collection(db, 'tracks'));
    return snap.docs
      .map((item) => mapTrackDoc(item.id, item.data()))
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createTrackWithUrl(
  input: {
    title: string;
    artist: string;
    audioUrl: string;
    fileName?: string;
    order: number;
    isPublic: boolean;
  },
  uid: string
): Promise<string> {
  const trackId = sanitizeDocId('track');
  const trackPath = `tracks/${trackId}`;
  try {
    await setDoc(doc(db, 'tracks', trackId), {
      title: clampString(input.title, SCHEMA_LIMITS.trackTitle) || 'Sin título',
      artist: clampString(input.artist || 'SMOKK', SCHEMA_LIMITS.trackArtist) || 'SMOKK',
      sourceType: 'url',
      audioUrl: clampString(input.audioUrl, SCHEMA_LIMITS.mediaUrl),
      mimeType: 'audio/mpeg',
      fileName: clampString(input.fileName || input.audioUrl, SCHEMA_LIMITS.fileName),
      fileSize: 0,
      chunkCount: 0,
      order: Math.max(0, Math.min(1000, Math.round(input.order))),
      isPublic: input.isPublic,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    clearPublicCmsCache();
    return trackId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, trackPath);
  }
}

async function deleteAllChunksForTrack(trackId: string): Promise<number> {
  const chunksPath = `tracks/${trackId}/chunks`;
  try {
    const snap = await getDocs(collection(db, 'tracks', trackId, 'chunks'));
    for (const chunkDoc of snap.docs) {
      await deleteDoc(doc(db, 'tracks', trackId, 'chunks', chunkDoc.id));
    }
    return snap.docs.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, chunksPath);
  }
}

export async function replaceTrackAudioSource(
  track: Track,
  audioUrl: string,
  fileName: string
): Promise<void> {
  const trackPath = `tracks/${track.id}`;
  if (track.sourceType === 'upload' || track.chunkCount > 0) {
    await deleteAllChunksForTrack(track.id);
  }
  try {
    await updateDoc(doc(db, 'tracks', track.id), {
      sourceType: 'url',
      audioUrl: clampString(audioUrl, SCHEMA_LIMITS.mediaUrl),
      mimeType: 'audio/mpeg',
      fileName: clampString(fileName || audioUrl, SCHEMA_LIMITS.fileName),
      fileSize: 0,
      chunkCount: 0,
      updatedAt: serverTimestamp(),
    });
    clearPublicCmsCache();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, trackPath);
  }
}

export async function updateTrackMeta(
  track: Track,
  patch: {
    title?: string;
    artist?: string;
    order?: number;
    isPublic?: boolean;
    audioUrl?: string;
  }
): Promise<void> {
  const trackPath = `tracks/${track.id}`;
  const nextIsPublic = patch.isPublic !== undefined ? patch.isPublic : track.isPublic;
  const updatePayload: Record<string, unknown> = {
    title: clampString(patch.title ?? track.title, SCHEMA_LIMITS.trackTitle) || 'Sin título',
    artist: clampString(patch.artist ?? track.artist, SCHEMA_LIMITS.trackArtist) || 'SMOKK',
    order: Math.max(0, Math.min(1000, Math.round(patch.order ?? track.order))),
    isPublic: nextIsPublic,
    updatedAt: serverTimestamp(),
  };

  if (patch.audioUrl !== undefined && track.sourceType === 'url') {
    updatePayload.audioUrl = clampString(patch.audioUrl, SCHEMA_LIMITS.mediaUrl);
  }

  try {
    await updateDoc(doc(db, 'tracks', track.id), updatePayload);
    clearPublicCmsCache();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, trackPath);
  }
}

export async function deleteTrackWithChunks(track: Track): Promise<void> {
  if (track.sourceType === 'upload' || track.chunkCount > 0) {
    await deleteAllChunksForTrack(track.id);
  }
  const trackPath = `tracks/${track.id}`;
  try {
    await deleteDoc(doc(db, 'tracks', track.id));
    clearPublicCmsCache();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, trackPath);
  }
}

// =========================================================================
// GALLERY (STORES ONLY GITHUB PATH OR HTTPS URL)
// =========================================================================
function mapGalleryDoc(id: string, d: Record<string, unknown>): GalleryItem {
  return {
    id,
    title: String(d.title || ''),
    imageUrl: String(d.imageUrl || ''),
    order: typeof d.order === 'number' ? d.order : 0,
    isPublic: Boolean(d.isPublic),
    ownerId: String(d.ownerId || ''),
  };
}

export async function fetchPublicGallery(): Promise<GalleryItem[]> {
  const path = 'gallery';
  try {
    const q = query(collection(db, 'gallery'), where('isPublic', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((item) => mapGalleryDoc(item.id, item.data()))
      .filter((item) => Boolean(item.imageUrl))
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAllGalleryAdmin(): Promise<GalleryItem[]> {
  const path = 'gallery';
  try {
    const snap = await getDocs(collection(db, 'gallery'));
    return snap.docs
      .map((item) => mapGalleryDoc(item.id, item.data()))
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addGalleryItem(
  input: { title: string; imageUrl: string; order: number; isPublic: boolean },
  uid: string
): Promise<string> {
  const id = sanitizeDocId('gal');
  const path = `gallery/${id}`;
  try {
    await setDoc(doc(db, 'gallery', id), {
      title: clampString(input.title, SCHEMA_LIMITS.galleryTitle),
      imageUrl: clampString(input.imageUrl, SCHEMA_LIMITS.imageDataUrl),
      order: Math.max(0, Math.min(1000, Math.round(input.order))),
      isPublic: input.isPublic,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    clearPublicCmsCache();
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateGalleryItem(
  id: string,
  patch: { title: string; imageUrl: string; order: number; isPublic: boolean }
): Promise<void> {
  const path = `gallery/${id}`;
  try {
    await updateDoc(doc(db, 'gallery', id), {
      title: clampString(patch.title, SCHEMA_LIMITS.galleryTitle),
      imageUrl: clampString(patch.imageUrl, SCHEMA_LIMITS.imageDataUrl),
      order: Math.max(0, Math.min(1000, Math.round(patch.order))),
      isPublic: patch.isPublic,
      updatedAt: serverTimestamp(),
    });
    clearPublicCmsCache();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const path = `gallery/${id}`;
  try {
    await deleteDoc(doc(db, 'gallery', id));
    clearPublicCmsCache();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// =========================================================================
// COLLABORATIONS (STORES ONLY TEXTS, LINKS & GITHUB PATHS)
// =========================================================================
function mapCollabDoc(id: string, d: Record<string, unknown>): Collaboration {
  return {
    id,
    title: String(d.title || ''),
    description: String(d.description || ''),
    imageUrl: String(d.imageUrl || ''),
    videoUrl: String(d.videoUrl || ''),
    youtubeUrl: String(d.youtubeUrl || ''),
    spotifyUrl: String(d.spotifyUrl || ''),
    isFeaturedArtist: Boolean(d.isFeaturedArtist),
    artistName: String(d.artistName || ''),
    artistPhotoUrl: String(d.artistPhotoUrl || ''),
    artistDescription: String(d.artistDescription || ''),
    order: typeof d.order === 'number' ? d.order : 0,
    isPublic: Boolean(d.isPublic),
    ownerId: String(d.ownerId || ''),
  };
}

export async function fetchPublicCollaborations(): Promise<Collaboration[]> {
  const path = 'collaborations';
  try {
    const q = query(collection(db, 'collaborations'), where('isPublic', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map((item) => mapCollabDoc(item.id, item.data()))
      .filter((item) => Boolean(item.title))
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchAllCollaborationsAdmin(): Promise<Collaboration[]> {
  const path = 'collaborations';
  try {
    const snap = await getDocs(collection(db, 'collaborations'));
    return snap.docs
      .map((item) => mapCollabDoc(item.id, item.data()))
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addCollaboration(
  input: {
    title: string;
    description: string;
    imageUrl: string;
    videoUrl: string;
    youtubeUrl: string;
    spotifyUrl: string;
    isFeaturedArtist: boolean;
    artistName: string;
    artistPhotoUrl: string;
    artistDescription: string;
    order: number;
    isPublic: boolean;
  },
  uid: string
): Promise<string> {
  const id = sanitizeDocId('colab');
  const path = `collaborations/${id}`;
  try {
    await setDoc(doc(db, 'collaborations', id), {
      title: clampString(input.title, SCHEMA_LIMITS.collabTitle) || 'Colaboración',
      description: clampString(input.description, SCHEMA_LIMITS.collabDescription),
      imageUrl: clampString(input.imageUrl, SCHEMA_LIMITS.imageDataUrl),
      videoUrl: clampString(input.videoUrl, SCHEMA_LIMITS.mediaUrl),
      youtubeUrl: clampString(input.youtubeUrl, SCHEMA_LIMITS.url),
      spotifyUrl: clampString(input.spotifyUrl, SCHEMA_LIMITS.url),
      isFeaturedArtist: Boolean(input.isFeaturedArtist),
      artistName: clampString(input.artistName, SCHEMA_LIMITS.collabArtistName),
      artistPhotoUrl: clampString(input.artistPhotoUrl, SCHEMA_LIMITS.collabArtistPhotoUrl),
      artistDescription: clampString(
        input.artistDescription,
        SCHEMA_LIMITS.collabArtistDescription
      ),
      order: Math.max(0, Math.min(1000, Math.round(input.order))),
      isPublic: input.isPublic,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    clearPublicCmsCache();
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCollaboration(
  id: string,
  patch: {
    title: string;
    description: string;
    imageUrl: string;
    videoUrl: string;
    youtubeUrl: string;
    spotifyUrl: string;
    isFeaturedArtist: boolean;
    artistName: string;
    artistPhotoUrl: string;
    artistDescription: string;
    order: number;
    isPublic: boolean;
  }
): Promise<void> {
  const path = `collaborations/${id}`;
  try {
    await updateDoc(doc(db, 'collaborations', id), {
      title: clampString(patch.title, SCHEMA_LIMITS.collabTitle) || 'Colaboración',
      description: clampString(patch.description, SCHEMA_LIMITS.collabDescription),
      imageUrl: clampString(patch.imageUrl, SCHEMA_LIMITS.imageDataUrl),
      videoUrl: clampString(patch.videoUrl, SCHEMA_LIMITS.mediaUrl),
      youtubeUrl: clampString(patch.youtubeUrl, SCHEMA_LIMITS.url),
      spotifyUrl: clampString(patch.spotifyUrl, SCHEMA_LIMITS.url),
      isFeaturedArtist: Boolean(patch.isFeaturedArtist),
      artistName: clampString(patch.artistName, SCHEMA_LIMITS.collabArtistName),
      artistPhotoUrl: clampString(patch.artistPhotoUrl, SCHEMA_LIMITS.collabArtistPhotoUrl),
      artistDescription: clampString(
        patch.artistDescription,
        SCHEMA_LIMITS.collabArtistDescription
      ),
      order: Math.max(0, Math.min(1000, Math.round(patch.order))),
      isPublic: patch.isPublic,
      updatedAt: serverTimestamp(),
    });
    clearPublicCmsCache();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCollaboration(id: string): Promise<void> {
  const path = `collaborations/${id}`;
  try {
    await deleteDoc(doc(db, 'collaborations', id));
    clearPublicCmsCache();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// =========================================================================
// PUBLIC SITE BUNDLE LOADER (WITH 30-MIN CACHE & STALE FALLBACK)
// =========================================================================
export async function fetchPublicSiteBundle(forceRefresh = false): Promise<PublicSiteBundle> {
  const cached = readPublicCmsCache();
  const isFresh = cached && Date.now() - cached.savedAt < PUBLIC_CACHE_TTL_MS;

  if (!forceRefresh && isFresh) {
    return cached;
  }

  const [cfgRes, tracksRes, galleryRes, collabsRes] = await Promise.allSettled([
    fetchSiteConfig(),
    fetchPublicTracks(),
    fetchPublicGallery(),
    fetchPublicCollaborations(),
  ]);

  const anyFulfilled =
    cfgRes.status === 'fulfilled' ||
    tracksRes.status === 'fulfilled' ||
    galleryRes.status === 'fulfilled' ||
    collabsRes.status === 'fulfilled';

  if (!anyFulfilled && cached) {
    // Graceful fallback: keep showing last real cached data instead of reverting to base defaults
    return cached;
  }

  const bundle: PublicSiteBundle = {
    config:
      cfgRes.status === 'fulfilled'
        ? cfgRes.value
        : cached?.config || { ...DEFAULT_SITE_CONFIG },
    tracks: tracksRes.status === 'fulfilled' ? tracksRes.value : cached?.tracks || [],
    gallery: galleryRes.status === 'fulfilled' ? galleryRes.value : cached?.gallery || [],
    collaborations:
      collabsRes.status === 'fulfilled' ? collabsRes.value : cached?.collaborations || [],
    savedAt: Date.now(),
  };

  if (anyFulfilled) {
    writePublicCmsCache(bundle);
  }
  return bundle;
}

// =========================================================================
// ONE-CLICK CLEANUP OF LEGACY HEAVY BINARY CHUNKS IN FIRESTORE
// =========================================================================
export async function cleanupLegacyFirestoreBlobs(
  uid: string
): Promise<{ deletedChunks: number; cleanedDocs: number }> {
  let deletedChunks = 0;
  let cleanedDocs = 0;

  // 1. Delete legacy background_video chunks & doc
  try {
    const bgChunksSnap = await getDocs(collection(db, 'media_assets', 'background_video', 'chunks'));
    for (const chunkDoc of bgChunksSnap.docs) {
      await deleteDoc(doc(db, 'media_assets', 'background_video', 'chunks', chunkDoc.id));
      deletedChunks++;
    }
    const bgMeta = await getDoc(doc(db, 'media_assets', 'background_video'));
    if (bgMeta.exists()) {
      await deleteDoc(doc(db, 'media_assets', 'background_video'));
      cleanedDocs++;
    }
  } catch {
    // ignore if absent
  }

  // 2. Delete legacy Firestore MP3 chunks & docs that relied on Firestore chunks
  try {
    const tracksSnap = await getDocs(collection(db, 'tracks'));
    for (const item of tracksSnap.docs) {
      const data = item.data();
      const isLegacyChunkTrack = data.sourceType === 'upload' || Number(data.chunkCount || 0) > 0;
      if (isLegacyChunkTrack) {
        deletedChunks += await deleteAllChunksForTrack(item.id);
        await deleteDoc(doc(db, 'tracks', item.id));
        cleanedDocs++;
      }
    }
  } catch {
    // ignore if none
  }

  // 3. Strip legacy base64 portrait/background images in site_config/main if present
  try {
    const cfg = await fetchSiteConfig();
    if (isBase64DataUrl(cfg.portraitImage) || isBase64DataUrl(cfg.backgroundImage)) {
      await saveSiteConfig(
        {
          ...cfg,
          portraitImage: isBase64DataUrl(cfg.portraitImage)
            ? DEFAULT_SITE_CONFIG.portraitImage
            : cfg.portraitImage,
          backgroundImage: isBase64DataUrl(cfg.backgroundImage) ? '' : cfg.backgroundImage,
        },
        uid
      );
      cleanedDocs++;
    }
  } catch {
    // ignore
  }

  clearPublicCmsCache();
  return { deletedChunks, cleanedDocs };
}
