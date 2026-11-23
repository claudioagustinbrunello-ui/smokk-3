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
import { ADMIN_BOOTSTRAP_EMAIL, db, handleFirestoreError, OperationType } from '../firebase';
import {
  Collaboration,
  DEFAULT_SITE_CONFIG,
  GalleryItem,
  MediaAsset,
  SCHEMA_LIMITS,
  SiteConfig,
  Track,
  TrackChunk,
} from '../types';
import {
  clampString,
  reassembleChunksToBlobUrl,
  reassembleIndexedChunksToBlobUrl,
  sanitizeDocId,
  splitAudioFileToBase64Chunks,
  splitBinaryFileToBase64Chunks,
} from '../utils/media';

// =========================================================================
// ADMIN CHECK
// =========================================================================
export async function checkIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase()) {
    return true;
  }
  const path = `admins/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists() && snap.data()?.role === 'admin';
  } catch {
    return false;
  }
}

// =========================================================================
// SITE CONFIG
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
      artistName: typeof d.artistName === 'string' && d.artistName ? d.artistName : DEFAULT_SITE_CONFIG.artistName,
      heroEyebrow: typeof d.heroEyebrow === 'string' ? d.heroEyebrow : DEFAULT_SITE_CONFIG.heroEyebrow,
      introKicker: typeof d.introKicker === 'string' ? d.introKicker : DEFAULT_SITE_CONFIG.introKicker,
      introCaption: typeof d.introCaption === 'string' ? d.introCaption : DEFAULT_SITE_CONFIG.introCaption,
      youtubeUrl: typeof d.youtubeUrl === 'string' ? d.youtubeUrl : DEFAULT_SITE_CONFIG.youtubeUrl,
      spotifyUrl: typeof d.spotifyUrl === 'string' ? d.spotifyUrl : DEFAULT_SITE_CONFIG.spotifyUrl,
      instagramUrl: typeof d.instagramUrl === 'string' ? d.instagramUrl : DEFAULT_SITE_CONFIG.instagramUrl,
      contactLine: typeof d.contactLine === 'string' ? d.contactLine : DEFAULT_SITE_CONFIG.contactLine,
      featuredVideoUrl: typeof d.featuredVideoUrl === 'string' ? d.featuredVideoUrl : DEFAULT_SITE_CONFIG.featuredVideoUrl,
      featuredVideoTitle: typeof d.featuredVideoTitle === 'string' ? d.featuredVideoTitle : DEFAULT_SITE_CONFIG.featuredVideoTitle,
      featuredVideoDescription:
        typeof d.featuredVideoDescription === 'string'
          ? d.featuredVideoDescription
          : DEFAULT_SITE_CONFIG.featuredVideoDescription,
      bioLead: typeof d.bioLead === 'string' ? d.bioLead : DEFAULT_SITE_CONFIG.bioLead,
      bioBody1: typeof d.bioBody1 === 'string' ? d.bioBody1 : DEFAULT_SITE_CONFIG.bioBody1,
      bioBody2: typeof d.bioBody2 === 'string' ? d.bioBody2 : DEFAULT_SITE_CONFIG.bioBody2,
      bioCredits: typeof d.bioCredits === 'string' ? d.bioCredits : DEFAULT_SITE_CONFIG.bioCredits,
      portraitImage: typeof d.portraitImage === 'string' ? d.portraitImage : DEFAULT_SITE_CONFIG.portraitImage,
      backgroundImage: typeof d.backgroundImage === 'string' ? d.backgroundImage : DEFAULT_SITE_CONFIG.backgroundImage,
      backgroundVideoUrl:
        typeof d.backgroundVideoUrl === 'string' ? d.backgroundVideoUrl : DEFAULT_SITE_CONFIG.backgroundVideoUrl,
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
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// =========================================================================
// TRACKS (MP3 UPLOAD & URL)
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
    return snap.docs
      .map((item) => mapTrackDoc(item.id, item.data()))
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

export async function fetchTrackAudioUrl(track: Track, isAdminView = false): Promise<string> {
  if (track.sourceType === 'url') {
    return track.audioUrl;
  }
  const path = `tracks/${track.id}/chunks`;
  try {
    const colRef = collection(db, 'tracks', track.id, 'chunks');
    const q = isAdminView ? colRef : query(colRef, where('isPublic', '==', true));
    const snap = await getDocs(q);
    const chunks: TrackChunk[] = snap.docs.map((item) => {
      const d = item.data();
      return {
        id: item.id,
        trackId: String(d.trackId || track.id),
        index: typeof d.index === 'number' ? d.index : 0,
        data: String(d.data || ''),
        isPublic: Boolean(d.isPublic),
        ownerId: String(d.ownerId || ''),
      };
    });
    if (!chunks.length) {
      throw new Error('No se encontraron los fragmentos de audio de esta canción.');
    }
    return reassembleChunksToBlobUrl(chunks, track.mimeType || 'audio/mpeg');
  } catch (error) {
    if (error instanceof Error && error.message.includes('fragmentos')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createTrackWithMp3(
  input: {
    title: string;
    artist: string;
    file: File;
    order: number;
    isPublic: boolean;
  },
  uid: string,
  onProgress?: (uploaded: number, total: number) => void
): Promise<string> {
  const chunks = await splitAudioFileToBase64Chunks(input.file);
  const trackId = sanitizeDocId('track');
  const trackPath = `tracks/${trackId}`;
  const mimeType = clampString(input.file.type || 'audio/mpeg', SCHEMA_LIMITS.mimeType);

  try {
    await setDoc(doc(db, 'tracks', trackId), {
      title: clampString(input.title, SCHEMA_LIMITS.trackTitle) || 'Sin título',
      artist: clampString(input.artist || 'SMOKK', SCHEMA_LIMITS.trackArtist) || 'SMOKK',
      sourceType: 'upload',
      audioUrl: '',
      mimeType,
      fileName: clampString(input.file.name || 'cancion.mp3', SCHEMA_LIMITS.fileName),
      fileSize: input.file.size,
      chunkCount: chunks.length,
      order: Math.max(0, Math.min(1000, Math.round(input.order))),
      isPublic: input.isPublic,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, trackPath);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `chunk_${String(i).padStart(4, '0')}`;
    const chunkPath = `tracks/${trackId}/chunks/${chunkId}`;
    try {
      await setDoc(doc(db, 'tracks', trackId, 'chunks', chunkId), {
        trackId,
        index: i,
        data: chunks[i],
        isPublic: input.isPublic,
        ownerId: uid,
        createdAt: serverTimestamp(),
      });
      onProgress?.(i + 1, chunks.length);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, chunkPath);
    }
  }

  return trackId;
}

export async function createTrackWithUrl(
  input: {
    title: string;
    artist: string;
    audioUrl: string;
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
      fileName: 'URL externa',
      fileSize: 0,
      chunkCount: 0,
      order: Math.max(0, Math.min(1000, Math.round(input.order))),
      isPublic: input.isPublic,
      ownerId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return trackId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, trackPath);
  }
}

async function deleteAllChunksForTrack(trackId: string): Promise<void> {
  const chunksPath = `tracks/${trackId}/chunks`;
  try {
    const snap = await getDocs(collection(db, 'tracks', trackId, 'chunks'));
    for (const chunkDoc of snap.docs) {
      await deleteDoc(doc(db, 'tracks', trackId, 'chunks', chunkDoc.id));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, chunksPath);
  }
}

export async function replaceTrackMp3(
  track: Track,
  file: File,
  uid: string,
  onProgress?: (uploaded: number, total: number) => void
): Promise<void> {
  const chunks = await splitAudioFileToBase64Chunks(file);
  const trackPath = `tracks/${track.id}`;
  const mimeType = clampString(file.type || 'audio/mpeg', SCHEMA_LIMITS.mimeType);

  await deleteAllChunksForTrack(track.id);

  try {
    await updateDoc(doc(db, 'tracks', track.id), {
      sourceType: 'upload',
      audioUrl: '',
      mimeType,
      fileName: clampString(file.name || 'cancion.mp3', SCHEMA_LIMITS.fileName),
      fileSize: file.size,
      chunkCount: chunks.length,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, trackPath);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `chunk_${String(i).padStart(4, '0')}`;
    const chunkPath = `tracks/${track.id}/chunks/${chunkId}`;
    try {
      await setDoc(doc(db, 'tracks', track.id, 'chunks', chunkId), {
        trackId: track.id,
        index: i,
        data: chunks[i],
        isPublic: track.isPublic,
        ownerId: uid,
        createdAt: serverTimestamp(),
      });
      onProgress?.(i + 1, chunks.length);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, chunkPath);
    }
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
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, trackPath);
  }

  // Keep chunk visibility synchronized with track visibility
  if (patch.isPublic !== undefined && patch.isPublic !== track.isPublic && track.sourceType === 'upload') {
    const chunksPath = `tracks/${track.id}/chunks`;
    try {
      const snap = await getDocs(collection(db, 'tracks', track.id, 'chunks'));
      for (const chunkDoc of snap.docs) {
        await updateDoc(doc(db, 'tracks', track.id, 'chunks', chunkDoc.id), {
          isPublic: nextIsPublic,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, chunksPath);
    }
  }
}

export async function deleteTrackWithChunks(trackId: string): Promise<void> {
  await deleteAllChunksForTrack(trackId);
  const trackPath = `tracks/${trackId}`;
  try {
    await deleteDoc(doc(db, 'tracks', trackId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, trackPath);
  }
}

// =========================================================================
// GALLERY
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
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const path = `gallery/${id}`;
  try {
    await deleteDoc(doc(db, 'gallery', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// =========================================================================
// COLLABORATIONS
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
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCollaboration(id: string): Promise<void> {
  const path = `collaborations/${id}`;
  try {
    await deleteDoc(doc(db, 'collaborations', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// =========================================================================
// BACKGROUND VIDEO (UPLOADED DIRECTLY TO FIRESTORE IN CHUNKS)
// =========================================================================
const BG_VIDEO_ASSET_ID = 'background_video';

export async function fetchBackgroundVideoMeta(): Promise<MediaAsset | null> {
  const path = `media_assets/${BG_VIDEO_ASSET_ID}`;
  try {
    const snap = await getDoc(doc(db, 'media_assets', BG_VIDEO_ASSET_ID));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      id: snap.id,
      kind: 'background_video',
      mimeType: String(d.mimeType || 'video/mp4'),
      fileName: String(d.fileName || 'video-fondo.mp4'),
      fileSize: typeof d.fileSize === 'number' ? d.fileSize : 0,
      chunkCount: typeof d.chunkCount === 'number' ? d.chunkCount : 0,
      isPublic: Boolean(d.isPublic),
      ownerId: String(d.ownerId || ''),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchBackgroundVideoBlobUrl(isAdminView = false): Promise<string | null> {
  const meta = await fetchBackgroundVideoMeta();
  if (!meta || (!meta.isPublic && !isAdminView) || meta.chunkCount <= 0) {
    return null;
  }
  const chunksPath = `media_assets/${BG_VIDEO_ASSET_ID}/chunks`;
  try {
    const colRef = collection(db, 'media_assets', BG_VIDEO_ASSET_ID, 'chunks');
    const q = isAdminView ? colRef : query(colRef, where('isPublic', '==', true));
    const snap = await getDocs(q);
    const chunks = snap.docs.map((item) => {
      const d = item.data();
      return {
        index: typeof d.index === 'number' ? d.index : 0,
        data: String(d.data || ''),
      };
    });
    if (!chunks.length) return null;
    return reassembleIndexedChunksToBlobUrl(chunks, meta.mimeType || 'video/mp4');
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, chunksPath);
  }
}

async function deleteAllBackgroundVideoChunks(): Promise<void> {
  const chunksPath = `media_assets/${BG_VIDEO_ASSET_ID}/chunks`;
  try {
    const snap = await getDocs(collection(db, 'media_assets', BG_VIDEO_ASSET_ID, 'chunks'));
    for (const chunkDoc of snap.docs) {
      await deleteDoc(doc(db, 'media_assets', BG_VIDEO_ASSET_ID, 'chunks', chunkDoc.id));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, chunksPath);
  }
}

export async function uploadOrReplaceBackgroundVideo(
  file: File,
  uid: string,
  onProgress?: (uploaded: number, total: number) => void
): Promise<void> {
  const chunks = await splitBinaryFileToBase64Chunks(file, 'video de fondo');
  const assetPath = `media_assets/${BG_VIDEO_ASSET_ID}`;
  const assetRef = doc(db, 'media_assets', BG_VIDEO_ASSET_ID);
  const mimeType = clampString(file.type || 'video/mp4', SCHEMA_LIMITS.mimeType);
  const fileName = clampString(file.name || 'video-fondo.mp4', SCHEMA_LIMITS.fileName);

  await deleteAllBackgroundVideoChunks();

  try {
    const existing = await getDoc(assetRef);
    if (existing.exists()) {
      await updateDoc(assetRef, {
        kind: 'background_video',
        mimeType,
        fileName,
        fileSize: file.size,
        chunkCount: chunks.length,
        isPublic: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(assetRef, {
        kind: 'background_video',
        mimeType,
        fileName,
        fileSize: file.size,
        chunkCount: chunks.length,
        isPublic: true,
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, assetPath);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkId = `chunk_${String(i).padStart(4, '0')}`;
    const chunkPath = `media_assets/${BG_VIDEO_ASSET_ID}/chunks/${chunkId}`;
    try {
      await setDoc(doc(db, 'media_assets', BG_VIDEO_ASSET_ID, 'chunks', chunkId), {
        assetId: BG_VIDEO_ASSET_ID,
        index: i,
        data: chunks[i],
        isPublic: true,
        ownerId: uid,
        createdAt: serverTimestamp(),
      });
      onProgress?.(i + 1, chunks.length);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, chunkPath);
    }
  }
}

export async function deleteBackgroundVideo(): Promise<void> {
  await deleteAllBackgroundVideoChunks();
  const assetPath = `media_assets/${BG_VIDEO_ASSET_ID}`;
  try {
    await deleteDoc(doc(db, 'media_assets', BG_VIDEO_ASSET_ID));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, assetPath);
  }
}

