export interface SiteConfig {
  artistName: string;
  heroEyebrow: string;
  introKicker: string;
  introCaption: string;
  youtubeUrl: string;
  spotifyUrl: string;
  instagramUrl: string;
  contactLine: string;
  featuredVideoUrl: string;
  featuredVideoTitle: string;
  featuredVideoDescription: string;
  bioLead: string;
  bioBody1: string;
  bioBody2: string;
  bioCredits: string;
  portraitImage: string;
  backgroundImage: string;
  backgroundVideoUrl: string;
  isPublic: boolean;
}

export type TrackSourceType = 'upload' | 'url';

export interface Track {
  id: string;
  title: string;
  artist: string;
  sourceType: TrackSourceType;
  audioUrl: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  chunkCount: number;
  order: number;
  isPublic: boolean;
  ownerId: string;
}

export interface TrackChunk {
  id: string;
  trackId: string;
  index: number;
  data: string;
  isPublic: boolean;
  ownerId: string;
}

export interface MediaAsset {
  id: string;
  kind: 'background_video';
  mimeType: string;
  fileName: string;
  fileSize: number;
  chunkCount: number;
  isPublic: boolean;
  ownerId: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  imageUrl: string;
  order: number;
  isPublic: boolean;
  ownerId: string;
}

export interface Collaboration {
  id: string;
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
  ownerId: string;
}

/**
 * Schema volumetric limits synchronized verbatim with firebase-blueprint.json & firestore.rules.
 */
export const SCHEMA_LIMITS = {
  artistName: 80,
  heroEyebrow: 120,
  introKicker: 100,
  introCaption: 100,
  url: 300,
  mediaUrl: 500,
  contactLine: 120,
  featuredVideoTitle: 140,
  featuredVideoDescription: 400,
  bioLead: 400,
  bioBody1: 800,
  bioBody2: 500,
  bioCredits: 500,
  imageDataUrl: 650000,
  backgroundVideoUrl: 400,
  trackTitle: 120,
  trackArtist: 120,
  fileName: 160,
  mimeType: 80,
  maxMp3Bytes: 15 * 1024 * 1024, // 15 MB (~39 chunks of 380KB raw)
  maxChunks: 45,
  chunkRawBytes: 380 * 1024, // ~506 KB base64 per chunk (< 650KB rule & < 1MB Firestore limit)
  galleryTitle: 140,
  collabTitle: 140,
  collabDescription: 500,
  collabArtistName: 100,
  collabArtistPhotoUrl: 500000,
  collabArtistDescription: 240,
} as const;

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  artistName: 'SMOKK',
  heroEyebrow: 'ARTISTA · PRODUCTOR · CATAMARCA',
  introKicker: 'EXPERIENCIA MUSICAL',
  introCaption: 'CATAMARCA · ARGENTINA',
  youtubeUrl: 'https://youtube.com/@smokk_2009',
  spotifyUrl: 'https://open.spotify.com/artist/6lcmuIRdh6cglv54iYnhH6',
  instagramUrl: 'https://instagram.com/smokk.la',
  contactLine: 'Catamarca, Argentina',
  featuredVideoUrl: 'https://youtu.be/u9YXc_-Qgec?si=RNsYFvkmL9Koi1h-',
  featuredVideoTitle: 'VIDEO DESTACADO · SMOKK',
  featuredVideoDescription: 'Videos, estrenos y novedades de SMOKK.',
  bioLead:
    'Leonardo Agustín Díaz es un artista argentino vinculado al rap, el freestyle y la producción musical.',
  bioBody1:
    'Su recorrido en la música comenzó aproximadamente en 2009, en una etapa en la que el freestyle empezó a ganar presencia en Catamarca. Actualmente desarrolla su faceta como productor, trabajando en beats y producciones musicales completas, y también como compositor de letras y canciones.',
  bioBody2:
    'Entre sus trabajos de composición se encuentra una canción realizada junto a Damián Córdoba y otro artista.',
  bioCredits:
    'En su recorrido también aparecen trabajos y colaboraciones vinculados con Bizarrap, Lit Killah, Kodigo, Rusherking, Valentín Vargas, KLABE y Tiago PZK.',
  portraitImage: '/material/imagenes/personaje.png',
  backgroundImage: '',
  backgroundVideoUrl: '',
  isPublic: true,
};
