import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Film,
  FolderGit2,
  Image as ImageIcon,
  LogOut,
  Music,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  Square,
  Star,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import {
  addCollaboration,
  addGalleryItem,
  checkIsAdmin,
  cleanupLegacyFirestoreBlobs,
  createTrackWithUrl,
  deleteCollaboration,
  deleteGalleryItem,
  deleteTrackWithChunks,
  fetchAllCollaborationsAdmin,
  fetchAllGalleryAdmin,
  fetchAllTracksAdmin,
  fetchSiteConfig,
  replaceTrackAudioSource,
  saveSiteConfig,
  updateCollaboration,
  updateGalleryItem,
  updateTrackMeta,
} from '../services/cms';
import {
  GitHubConfig,
  isGitHubReady,
  loadGitHubConfig,
  saveGitHubConfig,
  testGitHubConnection,
  uploadFileToGitHub,
} from '../services/github';
import {
  Collaboration,
  DEFAULT_SITE_CONFIG,
  GalleryItem,
  SCHEMA_LIMITS,
  SiteConfig,
  Track,
} from '../types';
import {
  formatBytes,
  getYoutubeId,
  isBase64DataUrl,
  optimizeImageForGitHub,
  resolveMediaUrl,
} from '../utils/media';

type AdminTab = 'music' | 'video' | 'gallery' | 'collabs' | 'general';

interface AdminPanelProps {
  onBackToSite: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBackToSite }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState<AdminTab>('music');
  const [loadingData, setLoadingData] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // GitHub repo storage config (stored locally in admin browser only, never in Firestore)
  const [ghConfig, setGhConfig] = useState<GitHubConfig>(() => loadGitHubConfig());
  const [showGhDrawer, setShowGhDrawer] = useState(() => !isGitHubReady(loadGitHubConfig()));
  const [testingGh, setTestingGh] = useState(false);
  const [cleaningLegacy, setCleaningLegacy] = useState(false);

  // CMS data (text, links & lightweight paths only)
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [collabs, setCollabs] = useState<Collaboration[]>([]);

  // Saving / uploading flags
  const [savingConfig, setSavingConfig] = useState(false);
  const [uploadingBgVideo, setUploadingBgVideo] = useState(false);
  const [uploadingPortrait, setUploadingPortrait] = useState(false);

  // Track creation state
  const [trackSourceMode, setTrackSourceMode] = useState<'github' | 'url'>('github');
  const [newTrackTitle, setNewTrackTitle] = useState('');
  const [newTrackArtist, setNewTrackArtist] = useState('SMOKK');
  const [newTrackUrl, setNewTrackUrl] = useState('');
  const [newTrackFile, setNewTrackFile] = useState<File | null>(null);
  const [uploadingTrack, setUploadingTrack] = useState(false);

  // Track replace & edit & preview
  const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTrackTitle, setEditTrackTitle] = useState('');
  const [editTrackArtist, setEditTrackArtist] = useState('');
  const [editTrackUrl, setEditTrackUrl] = useState('');
  const [editTrackOrder, setEditTrackOrder] = useState(1);
  const [confirmDeleteTrackId, setConfirmDeleteTrackId] = useState<string | null>(null);

  // Inline audio preview
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const replaceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Gallery creation state
  const [newGalleryTitle, setNewGalleryTitle] = useState('');
  const [newGalleryImageUrl, setNewGalleryImageUrl] = useState('');
  const [newGalleryPreview, setNewGalleryPreview] = useState('');
  const [uploadingGalleryImg, setUploadingGalleryImg] = useState(false);
  const [savingGallery, setSavingGallery] = useState(false);
  const [confirmDeleteGalleryId, setConfirmDeleteGalleryId] = useState<string | null>(null);

  // Collaboration creation/edit state
  const [editingCollabId, setEditingCollabId] = useState<string | null>(null);
  const [collabTitle, setCollabTitle] = useState('');
  const [collabDesc, setCollabDesc] = useState('');
  const [collabImageUrl, setCollabImageUrl] = useState('');
  const [collabImagePreview, setCollabImagePreview] = useState('');
  const [collabVideoUrl, setCollabVideoUrl] = useState('');
  const [collabYoutube, setCollabYoutube] = useState('');
  const [collabSpotify, setCollabSpotify] = useState('');
  const [collabFeaturedArtist, setCollabFeaturedArtist] = useState(false);
  const [collabArtistName, setCollabArtistName] = useState('');
  const [collabArtistPhotoUrl, setCollabArtistPhotoUrl] = useState('');
  const [collabArtistPhotoPreview, setCollabArtistPhotoPreview] = useState('');
  const [collabArtistDesc, setCollabArtistDesc] = useState('');
  const [uploadingCollabImg, setUploadingCollabImg] = useState(false);
  const [uploadingArtistImg, setUploadingArtistImg] = useState(false);
  const [savingCollab, setSavingCollab] = useState(false);
  const [confirmDeleteCollabId, setConfirmDeleteCollabId] = useState<string | null>(null);

  const [portraitPreview, setPortraitPreview] = useState('');

  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        const allowed = await checkIsAdmin(nextUser);
        setIsAdmin(allowed);
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Load ONLY lightweight text/link collections once on login
  const loadAllAdminData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [cfg, trk, gal, col] = await Promise.all([
        fetchSiteConfig(),
        fetchAllTracksAdmin(),
        fetchAllGalleryAdmin(),
        fetchAllCollaborationsAdmin(),
      ]);
      setConfig(cfg);
      setTracks(trk);
      setGallery(gal);
      setCollabs(col);
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'No se pudieron cargar los datos de Firebase.'
      );
    } finally {
      setLoadingData(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isAdmin) {
      void loadAllAdminData();
    }
  }, [isAdmin, loadAllAdminData]);

  const handleSaveGhConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    saveGitHubConfig(ghConfig);
    setTestingGh(true);
    try {
      const result = await testGitHubConnection(ghConfig);
      if (result.ok) {
        showToast('ok', result.message);
        setShowGhDrawer(false);
      } else {
        showToast('err', result.message);
      }
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al probar conexión con GitHub.');
    } finally {
      setTestingGh(false);
    }
  };

  const handleCleanupLegacy = async () => {
    if (!user) return;
    setCleaningLegacy(true);
    try {
      const res = await cleanupLegacyFirestoreBlobs(user.uid);
      await loadAllAdminData();
      showToast(
        'ok',
        `Limpieza completada: ${res.deletedChunks} bloques pesados y ${res.cleanedDocs} registros viejos eliminados de Firebase.`
      );
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'No se pudo limpiar los archivos viejos.'
      );
    } finally {
      setCleaningLegacy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.'
      );
    }
  };

  const handleSignOut = async () => {
    stopPreview();
    await signOut(auth);
  };

  // =========================================================================
  // AUDIO PREVIEW (PLAYS DIRECTLY FROM GITHUB PAGES / URL — 0 FIRESTORE READS)
  // =========================================================================
  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewTrackId(null);
  };

  const togglePreviewTrack = async (track: Track) => {
    if (previewTrackId === track.id) {
      stopPreview();
      return;
    }
    stopPreview();
    if (track.sourceType !== 'url' || !track.audioUrl) {
      showToast(
        'err',
        'Esta canción es un archivo viejo guardado en Firebase. Reemplazala para subirla a GitHub.'
      );
      return;
    }
    try {
      const audio = previewAudioRef.current;
      if (audio) {
        audio.src = resolveMediaUrl(track.audioUrl);
        await audio.play();
        setPreviewTrackId(track.id);
      }
    } catch {
      showToast(
        'err',
        'No se pudo reproducir todavía (si recién lo subiste a GitHub, esperá ~1 minuto a que GitHub Pages publique).'
      );
    }
  };

  // =========================================================================
  // TRACK HANDLERS (UPLOAD TO GITHUB, SAVE ONLY ~50-BYTE PATH IN FIRESTORE)
  // =========================================================================
  const handleAddTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const title = newTrackTitle.trim();
    const artist = newTrackArtist.trim() || config.artistName || 'SMOKK';

    if (!title) {
      showToast('err', 'Ingresá el título de la canción.');
      return;
    }

    setUploadingTrack(true);
    try {
      const nextOrder = tracks.length > 0 ? Math.max(...tracks.map((t) => t.order)) + 1 : 1;
      let finalUrl = '';
      let finalFileName = '';

      if (trackSourceMode === 'github') {
        if (!newTrackFile) {
          showToast('err', 'Seleccioná un archivo MP3 para subir a GitHub.');
          setUploadingTrack(false);
          return;
        }
        const uploaded = await uploadFileToGitHub(newTrackFile, 'musica', ghConfig);
        finalUrl = uploaded.publicPath;
        finalFileName = uploaded.fileName;
      } else {
        if (!newTrackUrl.trim()) {
          showToast('err', 'Ingresá la ruta en GitHub (ej: /material/uploads/musica/tema.mp3) o una URL.');
          setUploadingTrack(false);
          return;
        }
        finalUrl = newTrackUrl.trim();
        finalFileName = finalUrl.split('/').pop() || 'audio.mp3';
      }

      await createTrackWithUrl(
        {
          title,
          artist,
          audioUrl: finalUrl,
          fileName: finalFileName,
          order: nextOrder,
          isPublic: true,
        },
        user.uid
      );

      setNewTrackTitle('');
      setNewTrackArtist(config.artistName || 'SMOKK');
      setNewTrackFile(null);
      setNewTrackUrl('');
      setTracks(await fetchAllTracksAdmin());
      showToast(
        'ok',
        trackSourceMode === 'github'
          ? 'MP3 subido a GitHub y enlazado en Firebase (0 KB pesados en Firebase). GitHub Pages lo publica en ~1 min.'
          : 'Canción guardada y activa en la web.'
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al guardar la canción.');
    } finally {
      setUploadingTrack(false);
    }
  };

  const handleReplaceMp3 = async (track: Track, file: File | undefined) => {
    if (!file || !user) return;
    stopPreview();
    setReplacingTrackId(track.id);
    try {
      const uploaded = await uploadFileToGitHub(file, 'musica', ghConfig);
      await replaceTrackAudioSource(track, uploaded.publicPath, uploaded.fileName);
      setTracks(await fetchAllTracksAdmin());
      showToast(
        'ok',
        `MP3 reemplazado en GitHub para "${track.title}". GitHub Pages lo actualiza en ~1 min.`
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo reemplazar el MP3.');
    } finally {
      setReplacingTrackId(null);
    }
  };

  const startEditTrack = (track: Track) => {
    setEditingTrackId(track.id);
    setEditTrackTitle(track.title);
    setEditTrackArtist(track.artist);
    setEditTrackUrl(track.audioUrl);
    setEditTrackOrder(track.order);
  };

  const saveEditTrack = async (track: Track) => {
    try {
      await updateTrackMeta(track, {
        title: editTrackTitle.trim() || track.title,
        artist: editTrackArtist.trim() || track.artist,
        audioUrl: editTrackUrl.trim() || track.audioUrl,
        order: Number(editTrackOrder) || 1,
      });
      setEditingTrackId(null);
      setTracks(await fetchAllTracksAdmin());
      showToast('ok', 'Datos de la canción actualizados.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al actualizar canción.');
    }
  };

  const toggleTrackVisibility = async (track: Track) => {
    try {
      await updateTrackMeta(track, { isPublic: !track.isPublic });
      setTracks(await fetchAllTracksAdmin());
      showToast(
        'ok',
        !track.isPublic ? 'Canción activada en la web.' : 'Canción ocultada de la web.'
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al cambiar visibilidad.');
    }
  };

  const handleDeleteTrack = async (track: Track) => {
    stopPreview();
    try {
      await deleteTrackWithChunks(track);
      setConfirmDeleteTrackId(null);
      setTracks(await fetchAllTracksAdmin());
      showToast('ok', 'Canción eliminada.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al eliminar la canción.');
    }
  };

  // =========================================================================
  // CONFIG HANDLERS (UPLOAD PORTRAIT & BACKGROUND VIDEO TO GITHUB)
  // =========================================================================
  const handleSaveConfig = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) return;
    setSavingConfig(true);
    try {
      await saveSiteConfig(config, user.uid);
      showToast('ok', 'Cambios guardados en Firebase.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al guardar configuración.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleUploadPortraitToGitHub = async (file: File | undefined) => {
    if (!file || !user) return;
    setUploadingPortrait(true);
    try {
      const optimized = await optimizeImageForGitHub(file, 1400);
      const localPreview = URL.createObjectURL(optimized);
      setPortraitPreview(localPreview);
      const uploaded = await uploadFileToGitHub(optimized, 'imagenes', ghConfig);
      const nextCfg = { ...config, portraitImage: uploaded.publicPath };
      setConfig(nextCfg);
      await saveSiteConfig(nextCfg, user.uid);
      showToast(
        'ok',
        'Imagen principal subida a GitHub y guardada. GitHub Pages la publica en ~1 min.'
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo subir la imagen a GitHub.');
    } finally {
      setUploadingPortrait(false);
    }
  };

  const handleUploadBgVideoToGitHub = async (file: File | undefined) => {
    if (!file || !user) return;
    setUploadingBgVideo(true);
    try {
      const uploaded = await uploadFileToGitHub(file, 'video', ghConfig, 24 * 1024 * 1024);
      const nextCfg = { ...config, backgroundVideoUrl: uploaded.publicPath };
      setConfig(nextCfg);
      await saveSiteConfig(nextCfg, user.uid);
      showToast(
        'ok',
        'Video de fondo subido a GitHub y guardado (0 KB en Firebase). GitHub Pages lo publica en ~1 min.'
      );
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'No se pudo subir el video de fondo a GitHub.'
      );
    } finally {
      setUploadingBgVideo(false);
    }
  };

  const handleClearBgVideo = async () => {
    if (!user) return;
    setSavingConfig(true);
    try {
      const nextCfg = { ...config, backgroundVideoUrl: '' };
      setConfig(nextCfg);
      await saveSiteConfig(nextCfg, user.uid);
      showToast('ok', 'Video de fondo quitado.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo quitar el video.');
    } finally {
      setSavingConfig(false);
    }
  };

  // =========================================================================
  // GALLERY HANDLERS (UPLOAD IMAGE TO GITHUB, SAVE ONLY PATH IN FIRESTORE)
  // =========================================================================
  const handleGalleryFilePick = async (file: File | undefined) => {
    if (!file) return;
    setUploadingGalleryImg(true);
    try {
      const optimized = await optimizeImageForGitHub(file, 1400);
      setNewGalleryPreview(URL.createObjectURL(optimized));
      const uploaded = await uploadFileToGitHub(optimized, 'galeria', ghConfig);
      setNewGalleryImageUrl(uploaded.publicPath);
      if (!newGalleryTitle.trim()) {
        setNewGalleryTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      showToast('ok', 'Foto subida a GitHub. Tocá "Publicar en galería" para guardarla.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al subir imagen a GitHub.');
    } finally {
      setUploadingGalleryImg(false);
    }
  };

  const handleAddGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newGalleryImageUrl.trim()) {
      showToast('err', 'Subí una foto a GitHub o pegá una ruta/URL de imagen.');
      return;
    }
    setSavingGallery(true);
    try {
      const nextOrder = gallery.length > 0 ? Math.max(...gallery.map((g) => g.order)) + 1 : 1;
      await addGalleryItem(
        {
          title: newGalleryTitle.trim(),
          imageUrl: newGalleryImageUrl.trim(),
          order: nextOrder,
          isPublic: true,
        },
        user.uid
      );
      setNewGalleryTitle('');
      setNewGalleryImageUrl('');
      setNewGalleryPreview('');
      setGallery(await fetchAllGalleryAdmin());
      showToast('ok', 'Imagen agregada a la galería.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al guardar la imagen.');
    } finally {
      setSavingGallery(false);
    }
  };

  const toggleGalleryVisibility = async (item: GalleryItem) => {
    try {
      await updateGalleryItem(item.id, {
        title: item.title,
        imageUrl: item.imageUrl,
        order: item.order,
        isPublic: !item.isPublic,
      });
      setGallery(await fetchAllGalleryAdmin());
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al actualizar imagen.');
    }
  };

  const handleDeleteGallery = async (id: string) => {
    try {
      await deleteGalleryItem(id);
      setConfirmDeleteGalleryId(null);
      setGallery(await fetchAllGalleryAdmin());
      showToast('ok', 'Imagen eliminada.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al eliminar imagen.');
    }
  };

  // =========================================================================
  // COLLABORATIONS HANDLERS (IMAGES TO GITHUB, METADATA TO FIRESTORE)
  // =========================================================================
  const resetCollabForm = () => {
    setEditingCollabId(null);
    setCollabTitle('');
    setCollabDesc('');
    setCollabImageUrl('');
    setCollabImagePreview('');
    setCollabVideoUrl('');
    setCollabYoutube('');
    setCollabSpotify('');
    setCollabFeaturedArtist(false);
    setCollabArtistName('');
    setCollabArtistPhotoUrl('');
    setCollabArtistPhotoPreview('');
    setCollabArtistDesc('');
  };

  const handleCollabImagePick = async (file: File | undefined) => {
    if (!file) return;
    setUploadingCollabImg(true);
    try {
      const optimized = await optimizeImageForGitHub(file, 1000);
      setCollabImagePreview(URL.createObjectURL(optimized));
      const uploaded = await uploadFileToGitHub(optimized, 'colabs', ghConfig);
      setCollabImageUrl(uploaded.publicPath);
      showToast('ok', 'Imagen de colaboración subida a GitHub.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al subir imagen a GitHub.');
    } finally {
      setUploadingCollabImg(false);
    }
  };

  const handleCollabArtistPhotoPick = async (file: File | undefined) => {
    if (!file) return;
    setUploadingArtistImg(true);
    try {
      const optimized = await optimizeImageForGitHub(file, 900);
      setCollabArtistPhotoPreview(URL.createObjectURL(optimized));
      const uploaded = await uploadFileToGitHub(optimized, 'artistas', ghConfig);
      setCollabArtistPhotoUrl(uploaded.publicPath);
      showToast('ok', 'Foto del artista subida a GitHub.');
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'Error al subir la foto del artista a GitHub.'
      );
    } finally {
      setUploadingArtistImg(false);
    }
  };

  const handleSaveCollab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!collabTitle.trim()) {
      showToast('err', 'Ingresá el título de la canción o colaboración.');
      return;
    }
    if (collabFeaturedArtist && !collabArtistName.trim()) {
      showToast('err', 'Ingresá el nombre del artista destacado.');
      return;
    }
    setSavingCollab(true);
    try {
      const payload = {
        title: collabTitle.trim(),
        description: collabDesc.trim(),
        imageUrl: collabImageUrl.trim(),
        videoUrl: collabVideoUrl.trim(),
        youtubeUrl: collabYoutube.trim(),
        spotifyUrl: collabSpotify.trim(),
        isFeaturedArtist: collabFeaturedArtist,
        artistName: collabFeaturedArtist ? collabArtistName.trim() : '',
        artistPhotoUrl: collabFeaturedArtist ? collabArtistPhotoUrl.trim() : '',
        artistDescription: collabFeaturedArtist ? collabArtistDesc.trim() : '',
      };

      if (editingCollabId) {
        const existing = collabs.find((c) => c.id === editingCollabId);
        await updateCollaboration(editingCollabId, {
          ...payload,
          order: existing?.order ?? 1,
          isPublic: existing?.isPublic ?? true,
        });
        showToast('ok', 'Colaboración actualizada.');
      } else {
        const nextOrder = collabs.length > 0 ? Math.max(...collabs.map((c) => c.order)) + 1 : 1;
        await addCollaboration(
          {
            ...payload,
            order: nextOrder,
            isPublic: true,
          },
          user.uid
        );
        showToast('ok', 'Colaboración publicada.');
      }
      resetCollabForm();
      setCollabs(await fetchAllCollaborationsAdmin());
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al guardar colaboración.');
    } finally {
      setSavingCollab(false);
    }
  };

  const startEditCollab = (item: Collaboration) => {
    setEditingCollabId(item.id);
    setCollabTitle(item.title);
    setCollabDesc(item.description);
    setCollabImageUrl(item.imageUrl);
    setCollabImagePreview('');
    setCollabVideoUrl(item.videoUrl);
    setCollabYoutube(item.youtubeUrl);
    setCollabSpotify(item.spotifyUrl);
    setCollabFeaturedArtist(Boolean(item.isFeaturedArtist));
    setCollabArtistName(item.artistName || '');
    setCollabArtistPhotoUrl(item.artistPhotoUrl || '');
    setCollabArtistPhotoPreview('');
    setCollabArtistDesc(item.artistDescription || '');
  };

  const toggleCollabVisibility = async (item: Collaboration) => {
    try {
      await updateCollaboration(item.id, {
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        videoUrl: item.videoUrl,
        youtubeUrl: item.youtubeUrl,
        spotifyUrl: item.spotifyUrl,
        isFeaturedArtist: item.isFeaturedArtist,
        artistName: item.artistName,
        artistPhotoUrl: item.artistPhotoUrl,
        artistDescription: item.artistDescription,
        order: item.order,
        isPublic: !item.isPublic,
      });
      setCollabs(await fetchAllCollaborationsAdmin());
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al actualizar colaboración.');
    }
  };

  const handleDeleteCollab = async (id: string) => {
    try {
      await deleteCollaboration(id);
      setConfirmDeleteCollabId(null);
      if (editingCollabId === id) resetCollabForm();
      setCollabs(await fetchAllCollaborationsAdmin());
      showToast('ok', 'Colaboración eliminada.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al eliminar colaboración.');
    }
  };

  // =========================================================================
  // RENDER: LOADING / LOGIN GATE / UNAUTHORIZED
  // =========================================================================
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080809] text-[#f5f3f3] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-[#f02b49] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs tracking-[0.2em] uppercase text-[#aaa6aa]">
            Verificando sesión…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080809] text-[#f5f3f3] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md border border-white/15 bg-[#111113] p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-[0.24em] text-[#f02b49] uppercase">
              PANEL DE ADMINISTRACIÓN
            </p>
            <h1 className="font-['Barlow_Condensed'] text-5xl font-black tracking-tight leading-none">
              SMOKK <span className="text-[#f02b49]">ADMIN</span>
            </h1>
            <p className="text-sm text-[#aaa6aa]">
              Iniciá sesión con tu cuenta de Google autorizada para administrar canciones MP3,
              videos, galería, colaboraciones y textos.
            </p>
          </div>

          {authError && (
            <div className="border border-[#f02b49]/50 bg-[#c10e2e]/15 p-3 text-xs text-[#ffd2d9]">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-3.5 px-5 bg-[#c10e2e] hover:bg-[#e0163a] text-white text-xs font-extrabold tracking-[0.14em] uppercase transition-colors flex items-center justify-center gap-2.5"
          >
            Ingresar con Google
          </button>

          <button
            type="button"
            onClick={onBackToSite}
            className="w-full py-3 px-4 border border-white/15 hover:border-white/35 text-xs font-bold tracking-[0.12em] uppercase text-[#c5c0c3] flex items-center justify-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a la página pública
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#080809] text-[#f5f3f3] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md border border-[#f02b49]/40 bg-[#111113] p-8 space-y-5">
          <div className="flex items-center gap-3 text-[#f02b49]">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <p className="text-xs font-extrabold tracking-[0.2em] uppercase">ACCESO RESTRINGIDO</p>
          </div>
          <h1 className="font-['Barlow_Condensed'] text-4xl font-black tracking-tight">
            CUENTA NO AUTORIZADA
          </h1>
          <p className="text-sm text-[#aaa6aa]">
            Ingresaste como <strong className="text-white">{user.email}</strong>, pero esta cuenta
            no tiene permisos de administrador para SMOKK.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex-1 py-3 px-4 bg-[#c10e2e] hover:bg-[#e0163a] text-white text-xs font-extrabold tracking-[0.12em] uppercase"
            >
              Cambiar de cuenta
            </button>
            <button
              type="button"
              onClick={onBackToSite}
              className="flex-1 py-3 px-4 border border-white/15 hover:border-white/35 text-xs font-bold tracking-[0.12em] uppercase text-[#c5c0c3]"
            >
              Ir al sitio
            </button>
          </div>
        </div>
      </div>
    );
  }

  const previewYoutubeId = getYoutubeId(config.featuredVideoUrl) || 'u9YXc_-Qgec';
  const ghConnected = isGitHubReady(ghConfig);
  const hasLegacyItems =
    tracks.some((t) => t.sourceType === 'upload' || t.chunkCount > 0) ||
    isBase64DataUrl(config.portraitImage) ||
    isBase64DataUrl(config.backgroundImage) ||
    gallery.some((g) => isBase64DataUrl(g.imageUrl)) ||
    collabs.some((c) => isBase64DataUrl(c.imageUrl) || isBase64DataUrl(c.artistPhotoUrl));

  return (
    <div className="min-h-screen bg-[#080809] text-[#f5f3f3] pb-16">
      <audio
        ref={previewAudioRef}
        onEnded={() => setPreviewTrackId(null)}
        onPause={() => setPreviewTrackId(null)}
      />

      {/* Sticky Header */}
      <header className="sticky top-0 z-30 border-b border-white/15 bg-[#080809]/92 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 bg-[#c10e2e] grid place-items-center font-['Barlow_Condensed'] font-black text-xl leading-none shrink-0">
              S
            </span>
            <div className="min-w-0">
              <p className="font-['Barlow_Condensed'] text-xl font-black tracking-tight leading-none">
                SMOKK <span className="text-[#f02b49]">ADMIN</span>
              </p>
              <p className="text-[11px] text-[#aaa6aa] truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onBackToSite}
              className="px-3.5 py-2 border border-white/20 hover:border-white/45 text-[11px] font-bold tracking-[0.12em] uppercase flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ver sitio</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold tracking-[0.12em] uppercase flex items-center gap-1.5 text-[#d3ced0] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Toast Banner */}
        {toast && (
          <div
            role="status"
            className={`p-3.5 border text-sm flex items-center gap-2.5 ${
              toast.type === 'ok'
                ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-100'
                : 'border-[#f02b49]/50 bg-[#c10e2e]/20 text-[#ffd2d9]'
            }`}
          >
            {toast.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0 text-[#f02b49]" />
            )}
            <span>{toast.text}</span>
          </div>
        )}

        {/* GitHub Media Storage Connection Bar */}
        <section className="border border-white/15 bg-[#111113] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <FolderGit2
                className={`w-5 h-5 shrink-0 ${
                  ghConnected ? 'text-emerald-400' : 'text-[#f02b49]'
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white">
                  {ghConnected
                    ? `Archivos en GitHub: ${ghConfig.owner}/${ghConfig.repo}`
                    : 'Conectá GitHub para subir MP3, videos y fotos gratis'}
                </p>
                <p className="text-[11px] text-[#aaa6aa]">
                  Los archivos pesados se guardan en tu repo de GitHub (0 KB en Firebase). Firebase
                  solo guarda textos y enlaces.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasLegacyItems && (
                <button
                  type="button"
                  disabled={cleaningLegacy}
                  onClick={() => void handleCleanupLegacy()}
                  className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-[11px] font-bold uppercase tracking-wider text-amber-200"
                >
                  {cleaningLegacy ? 'Limpiando…' : 'Limpiar archivos viejos de Firebase'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGhDrawer((prev) => !prev)}
                className="px-3 py-1.5 border border-white/20 hover:border-white/45 text-[11px] font-bold uppercase tracking-wider text-[#d3ced0]"
              >
                {showGhDrawer ? 'Ocultar' : ghConnected ? 'Configurar GitHub' : 'Conectar GitHub'}
              </button>
            </div>
          </div>

          {showGhDrawer && (
            <form
              onSubmit={handleSaveGhConfig}
              className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
            >
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#c5c0c3] mb-1">
                  Usuario de GitHub
                </label>
                <input
                  type="text"
                  required
                  value={ghConfig.owner}
                  onChange={(e) => setGhConfig((p) => ({ ...p, owner: e.target.value }))}
                  placeholder="tu-usuario"
                  className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#c5c0c3] mb-1">
                  Repositorio
                </label>
                <input
                  type="text"
                  required
                  value={ghConfig.repo}
                  onChange={(e) => setGhConfig((p) => ({ ...p, repo: e.target.value }))}
                  placeholder="smokk"
                  className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#c5c0c3] mb-1">
                  Rama
                </label>
                <input
                  type="text"
                  value={ghConfig.branch}
                  onChange={(e) => setGhConfig((p) => ({ ...p, branch: e.target.value }))}
                  placeholder="main"
                  className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#c5c0c3] mb-1">
                  Token de acceso del repo (solo en este navegador)
                </label>
                <input
                  type="password"
                  required
                  value={ghConfig.token}
                  onChange={(e) => setGhConfig((p) => ({ ...p, token: e.target.value }))}
                  placeholder="github_pat_..."
                  className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-[11px] text-[#aaa6aa]">
                  En GitHub: Settings → Developer settings → Personal access tokens → Fine-grained
                  tokens → elegí tu repo con permiso <strong className="text-white">Contents: Read and write</strong>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {!hasLegacyItems && (
                    <button
                      type="button"
                      disabled={cleaningLegacy}
                      onClick={() => void handleCleanupLegacy()}
                      className="px-3 py-2 border border-white/15 hover:border-white/35 disabled:opacity-50 text-[11px] font-bold uppercase tracking-wider text-[#c5c0c3]"
                    >
                      {cleaningLegacy ? 'Limpiando…' : 'Limpiar residuos viejos en Firebase'}
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={testingGh}
                    className="px-4 py-2 bg-[#c10e2e] hover:bg-[#e0163a] disabled:opacity-50 text-white text-[11px] font-extrabold uppercase tracking-wider"
                  >
                    {testingGh ? 'Verificando…' : 'Guardar y probar'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>

        {/* Section Tabs */}
        <nav
          aria-label="Secciones de administración"
          className="flex flex-wrap gap-2 border-b border-white/15 pb-4"
        >
          {(
            [
              { id: 'music', label: 'Música (MP3)', icon: Music },
              { id: 'video', label: 'Video destacado', icon: Film },
              { id: 'gallery', label: 'Galería', icon: ImageIcon },
              { id: 'collabs', label: 'Colaboraciones', icon: Users },
              { id: 'general', label: 'General & Bio', icon: Settings },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2.5 text-xs font-extrabold tracking-[0.12em] uppercase flex items-center gap-2 border transition-colors ${
                  active
                    ? 'bg-[#c10e2e] border-[#f02b49] text-white'
                    : 'bg-[#111113] border-white/10 text-[#c5c0c3] hover:border-white/30'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </nav>

        {loadingData ? (
          <div className="py-16 text-center text-xs tracking-[0.2em] uppercase text-[#aaa6aa]">
            Cargando contenido…
          </div>
        ) : (
          <>
            {/* ===============================================================
                TAB 1: MÚSICA (SUBE MP3 A GITHUB, GUARDA RUTA EN FIREBASE)
               =============================================================== */}
            {activeTab === 'music' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <section className="lg:col-span-5 border border-white/15 bg-[#111113] p-6 space-y-5 h-fit">
                  <div>
                    <p className="text-[11px] font-bold tracking-[0.22em] text-[#f02b49] uppercase">
                      NUEVA CANCIÓN
                    </p>
                    <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight mt-1">
                      SUBIR MP3 A GITHUB
                    </h2>
                    <p className="text-xs text-[#aaa6aa] mt-1">
                      El archivo MP3 se guarda en tu repositorio de GitHub y suena desde GitHub
                      Pages sin gastar cuota de Firebase.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTrackSourceMode('github')}
                      className={`py-2.5 px-3 text-[11px] font-extrabold tracking-[0.1em] uppercase border ${
                        trackSourceMode === 'github'
                          ? 'bg-[#c10e2e]/20 border-[#f02b49] text-white'
                          : 'border-white/10 text-[#aaa6aa]'
                      }`}
                    >
                      Subir MP3 a GitHub
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrackSourceMode('url')}
                      className={`py-2.5 px-3 text-[11px] font-extrabold tracking-[0.1em] uppercase border ${
                        trackSourceMode === 'url'
                          ? 'bg-[#c10e2e]/20 border-[#f02b49] text-white'
                          : 'border-white/10 text-[#aaa6aa]'
                      }`}
                    >
                      Ruta / URL MP3
                    </button>
                  </div>

                  <form onSubmit={handleAddTrack} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                        Título de la canción *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={SCHEMA_LIMITS.trackTitle}
                        value={newTrackTitle}
                        onChange={(e) => setNewTrackTitle(e.target.value)}
                        placeholder="Ej: Forte"
                        className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                        Artista
                      </label>
                      <input
                        type="text"
                        maxLength={SCHEMA_LIMITS.trackArtist}
                        value={newTrackArtist}
                        onChange={(e) => setNewTrackArtist(e.target.value)}
                        placeholder="SMOKK"
                        className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                      />
                    </div>

                    {trackSourceMode === 'github' ? (
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                          Archivo MP3 (hasta 24 MB, alojado en GitHub) *
                        </label>
                        <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/25 hover:border-[#f02b49] bg-[#080809] p-5 text-center cursor-pointer transition-colors">
                          <Upload className="w-5 h-5 text-[#f02b49]" />
                          <span className="text-xs font-semibold text-white">
                            {newTrackFile ? newTrackFile.name : 'Elegí tu archivo .mp3'}
                          </span>
                          <span className="text-[11px] text-[#aaa6aa]">
                            {newTrackFile
                              ? `${formatBytes(newTrackFile.size)} · Se subirá a GitHub`
                              : 'Formatos: MP3, M4A, WAV, OGG · Máx 24 MB'}
                          </span>
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp3,audio/*,.mp3"
                            className="hidden"
                            onChange={(e) => {
                              const picked = e.target.files?.[0] || null;
                              setNewTrackFile(picked);
                              if (picked && !newTrackTitle.trim()) {
                                setNewTrackTitle(picked.name.replace(/\.[^.]+$/, ''));
                              }
                            }}
                          />
                        </label>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                          Ruta en GitHub o URL directa *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={SCHEMA_LIMITS.mediaUrl}
                          value={newTrackUrl}
                          onChange={(e) => setNewTrackUrl(e.target.value)}
                          placeholder="/material/uploads/musica/tema.mp3 o https://..."
                          className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={uploadingTrack}
                      className="w-full py-3.5 bg-[#c10e2e] hover:bg-[#e0163a] disabled:opacity-50 text-white text-xs font-extrabold tracking-[0.14em] uppercase flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {uploadingTrack ? 'Subiendo a GitHub…' : 'Guardar canción'}
                    </button>
                  </form>
                </section>

                {/* Track List */}
                <section className="lg:col-span-7 border border-white/15 bg-[#111113] p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.22em] text-[#f02b49] uppercase">
                        PLAYLIST ACTIVA
                      </p>
                      <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight mt-1">
                        CANCIONES CARGADAS ({tracks.length})
                      </h2>
                    </div>
                  </div>

                  {tracks.length === 0 ? (
                    <div className="border border-dashed border-white/20 p-8 text-center text-sm text-[#aaa6aa]">
                      Todavía no cargaste canciones. Usá el formulario de la izquierda para subir tu
                      MP3 a GitHub.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tracks.map((track, idx) => {
                        const isReplacing = replacingTrackId === track.id;
                        const isEditing = editingTrackId === track.id;
                        const isPlayingPreview = previewTrackId === track.id;
                        const isLegacy = track.sourceType === 'upload' || track.chunkCount > 0;

                        return (
                          <div
                            key={track.id}
                            className="border border-white/12 bg-[#080809] p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <button
                                  type="button"
                                  disabled={isReplacing}
                                  onClick={() => void togglePreviewTrack(track)}
                                  title={isPlayingPreview ? 'Detener vista previa' : 'Escuchar MP3'}
                                  className="w-10 h-10 bg-[#221015] hover:bg-[#c10e2e] border border-[#f02b49]/35 grid place-items-center shrink-0 transition-colors"
                                >
                                  {isPlayingPreview ? (
                                    <Square className="w-4 h-4 fill-white" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-white ml-0.5" />
                                  )}
                                </button>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[11px] font-extrabold text-[#f02b49]">
                                      #{idx + 1}
                                    </span>
                                    <strong className="text-sm text-white truncate">
                                      {track.title}
                                    </strong>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider ${
                                        track.isPublic
                                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                          : 'bg-white/5 text-[#aaa6aa] border border-white/15'
                                      }`}
                                    >
                                      {track.isPublic ? 'Activa' : 'Oculta'}
                                    </span>
                                    {isLegacy && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                        Migrar a GitHub
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-[#aaa6aa] mt-0.5 truncate">
                                    {track.artist} · {track.audioUrl || track.fileName || 'MP3'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  ref={(el) => {
                                    replaceInputRefs.current[track.id] = el;
                                  }}
                                  type="file"
                                  accept="audio/mpeg,audio/mp3,audio/*,.mp3"
                                  className="hidden"
                                  onChange={(e) => {
                                    const picked = e.target.files?.[0];
                                    e.target.value = '';
                                    void handleReplaceMp3(track, picked);
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={isReplacing}
                                  onClick={() => replaceInputRefs.current[track.id]?.click()}
                                  className="px-3 py-1.5 bg-[#c10e2e]/20 hover:bg-[#c10e2e] border border-[#f02b49]/50 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                                >
                                  <RefreshCw
                                    className={`w-3.5 h-3.5 ${isReplacing ? 'animate-spin' : ''}`}
                                  />
                                  {isReplacing ? 'Subiendo…' : 'Reemplazar MP3'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditing ? setEditingTrackId(null) : startEditTrack(track)
                                  }
                                  className="px-2.5 py-1.5 border border-white/15 hover:border-white/35 text-[11px] font-bold uppercase text-[#d3ced0]"
                                >
                                  {isEditing ? 'Cancelar' : 'Editar'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void toggleTrackVisibility(track)}
                                  title={track.isPublic ? 'Ocultar' : 'Activar'}
                                  className="p-1.5 border border-white/15 hover:border-white/35 text-[#d3ced0]"
                                >
                                  {track.isPublic ? (
                                    <Eye className="w-4 h-4" />
                                  ) : (
                                    <EyeOff className="w-4 h-4" />
                                  )}
                                </button>

                                {confirmDeleteTrackId === track.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteTrack(track)}
                                      className="px-2.5 py-1.5 bg-[#c10e2e] text-white text-[11px] font-extrabold uppercase"
                                    >
                                      Confirmar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteTrackId(null)}
                                      className="px-2 py-1.5 border border-white/15 text-[11px] text-[#aaa6aa]"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteTrackId(track.id)}
                                    title="Eliminar canción"
                                    className="p-1.5 border border-white/15 hover:border-[#f02b49] text-[#aaa6aa] hover:text-[#f02b49]"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {isEditing && (
                              <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                <div className="sm:col-span-4">
                                  <label className="block text-[10px] uppercase tracking-wider text-[#aaa6aa] mb-1">
                                    Título
                                  </label>
                                  <input
                                    type="text"
                                    maxLength={SCHEMA_LIMITS.trackTitle}
                                    value={editTrackTitle}
                                    onChange={(e) => setEditTrackTitle(e.target.value)}
                                    className="w-full bg-[#111113] border border-white/15 px-3 py-2 text-xs text-white"
                                  />
                                </div>
                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] uppercase tracking-wider text-[#aaa6aa] mb-1">
                                    Artista
                                  </label>
                                  <input
                                    type="text"
                                    maxLength={SCHEMA_LIMITS.trackArtist}
                                    value={editTrackArtist}
                                    onChange={(e) => setEditTrackArtist(e.target.value)}
                                    className="w-full bg-[#111113] border border-white/15 px-3 py-2 text-xs text-white"
                                  />
                                </div>
                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] uppercase tracking-wider text-[#aaa6aa] mb-1">
                                    Ruta / URL MP3
                                  </label>
                                  <input
                                    type="text"
                                    maxLength={SCHEMA_LIMITS.mediaUrl}
                                    value={editTrackUrl}
                                    onChange={(e) => setEditTrackUrl(e.target.value)}
                                    className="w-full bg-[#111113] border border-white/15 px-3 py-2 text-xs text-white"
                                  />
                                </div>
                                <div className="sm:col-span-1">
                                  <label className="block text-[10px] uppercase tracking-wider text-[#aaa6aa] mb-1">
                                    Orden
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={1000}
                                    value={editTrackOrder}
                                    onChange={(e) => setEditTrackOrder(Number(e.target.value))}
                                    className="w-full bg-[#111113] border border-white/15 px-2 py-2 text-xs text-white"
                                  />
                                </div>
                                <div className="sm:col-span-1">
                                  <button
                                    type="button"
                                    onClick={() => void saveEditTrack(track)}
                                    className="w-full py-2 bg-[#c10e2e] hover:bg-[#e0163a] text-white text-[11px] font-extrabold uppercase"
                                  >
                                    OK
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ===============================================================
                TAB 2: VIDEO DESTACADO (ÚLTIMO ESTRENO)
               =============================================================== */}
            {activeTab === 'video' && (
              <form
                onSubmit={handleSaveConfig}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6"
              >
                <div className="lg:col-span-5 border border-white/15 bg-[#111113] p-6 space-y-4 h-fit">
                  <div>
                    <p className="text-[11px] font-bold tracking-[0.22em] text-[#f02b49] uppercase">
                      SECCIÓN ÚLTIMO ESTRENO
                    </p>
                    <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight mt-1">
                      VIDEO DESTACADO DE YOUTUBE
                    </h2>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Enlace o ID de YouTube
                    </label>
                    <input
                      type="text"
                      maxLength={SCHEMA_LIMITS.url}
                      value={config.featuredVideoUrl}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, featuredVideoUrl: e.target.value }))
                      }
                      placeholder="https://youtu.be/..."
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Epígrafe del video
                    </label>
                    <input
                      type="text"
                      maxLength={SCHEMA_LIMITS.featuredVideoTitle}
                      value={config.featuredVideoTitle}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, featuredVideoTitle: e.target.value }))
                      }
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Descripción
                    </label>
                    <textarea
                      rows={3}
                      maxLength={SCHEMA_LIMITS.featuredVideoDescription}
                      value={config.featuredVideoDescription}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          featuredVideoDescription: e.target.value,
                        }))
                      }
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="w-full py-3.5 bg-[#c10e2e] hover:bg-[#e0163a] disabled:opacity-50 text-white text-xs font-extrabold tracking-[0.14em] uppercase flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {savingConfig ? 'Guardando…' : 'Guardar video'}
                  </button>
                </div>

                <div className="lg:col-span-7 border border-white/15 bg-[#111113] p-6 space-y-3">
                  <p className="text-[11px] font-bold tracking-[0.2em] text-[#aaa6aa] uppercase">
                    VISTA PREVIA EN VIVO
                  </p>
                  <div className="aspect-video w-full bg-black border border-white/10 overflow-hidden">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${previewYoutubeId}`}
                      title="Vista previa del video destacado"
                      className="w-full h-full border-0"
                      allowFullScreen
                    />
                  </div>
                  <p className="text-xs tracking-[0.14em] text-[#d4cdd0]">
                    {config.featuredVideoTitle}
                  </p>
                </div>
              </form>
            )}

            {/* ===============================================================
                TAB 3: GALERÍA (OTROS PLANOS — FOTOS EN GITHUB)
               =============================================================== */}
            {activeTab === 'gallery' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleAddGallery}
                  className="lg:col-span-4 border border-white/15 bg-[#111113] p-6 space-y-4 h-fit"
                >
                  <div>
                    <p className="text-[11px] font-bold tracking-[0.22em] text-[#f02b49] uppercase">
                      OTROS PLANOS
                    </p>
                    <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight mt-1">
                      AGREGAR IMAGEN
                    </h2>
                  </div>

                  <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/25 hover:border-[#f02b49] bg-[#080809] p-5 text-center cursor-pointer">
                    <Upload className="w-5 h-5 text-[#f02b49]" />
                    <span className="text-xs font-semibold">
                      {uploadingGalleryImg
                        ? 'Subiendo foto a GitHub…'
                        : 'Subir foto a GitHub desde tu dispositivo'}
                    </span>
                    <span className="text-[11px] text-[#aaa6aa]">
                      Se optimiza y se aloja en tu repo (0 KB en Firebase)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingGalleryImg}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        void handleGalleryFilePick(f);
                      }}
                    />
                  </label>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Ruta en GitHub o URL de imagen
                    </label>
                    <input
                      type="text"
                      value={newGalleryImageUrl}
                      onChange={(e) => setNewGalleryImageUrl(e.target.value)}
                      placeholder="/material/uploads/galeria/foto.jpg o https://..."
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  {(newGalleryPreview || newGalleryImageUrl) && (
                    <div className="border border-white/15 bg-black overflow-hidden">
                      <img
                        src={newGalleryPreview || resolveMediaUrl(newGalleryImageUrl)}
                        alt="Vista previa"
                        className="w-full h-44 object-cover"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Epígrafe (opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={SCHEMA_LIMITS.galleryTitle}
                      value={newGalleryTitle}
                      onChange={(e) => setNewGalleryTitle(e.target.value)}
                      placeholder="Ej: Estudio Catamarca"
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingGallery || uploadingGalleryImg}
                    className="w-full py-3.5 bg-[#c10e2e] hover:bg-[#e0163a] disabled:opacity-50 text-white text-xs font-extrabold tracking-[0.14em] uppercase flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {savingGallery ? 'Guardando…' : 'Publicar en galería'}
                  </button>
                </form>

                <div className="lg:col-span-8 border border-white/15 bg-[#111113] p-6 space-y-4">
                  <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight">
                    IMÁGENES PUBLICADAS ({gallery.length})
                  </h2>

                  {gallery.length === 0 ? (
                    <div className="border border-dashed border-white/20 p-8 text-center text-sm text-[#aaa6aa]">
                      Todavía no hay fotos en la galería.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {gallery.map((item) => (
                        <div
                          key={item.id}
                          className="border border-white/12 bg-[#080809] overflow-hidden flex flex-col"
                        >
                          <img
                            src={resolveMediaUrl(item.imageUrl)}
                            alt={item.title || 'Galería'}
                            className="w-full h-44 object-cover"
                          />
                          <div className="p-3 flex-1 flex flex-col justify-between gap-3">
                            <p className="text-xs text-[#d2cdd0] truncate">
                              {item.title || 'Sin epígrafe'}
                            </p>
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => void toggleGalleryVisibility(item)}
                                className="text-[11px] font-bold uppercase text-[#aaa6aa] hover:text-white flex items-center gap-1"
                              >
                                {item.isPublic ? (
                                  <>
                                    <Eye className="w-3.5 h-3.5 text-emerald-400" /> Visible
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5" /> Oculta
                                  </>
                                )}
                              </button>

                              {confirmDeleteGalleryId === item.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteGallery(item.id)}
                                    className="px-2 py-1 bg-[#c10e2e] text-white text-[10px] font-bold uppercase"
                                  >
                                    Sí
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteGalleryId(null)}
                                    className="px-2 py-1 border border-white/15 text-[10px]"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteGalleryId(item.id)}
                                  className="text-[#aaa6aa] hover:text-[#f02b49]"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===============================================================
                TAB 4: COLABORACIONES (ALGUNAS COLABS + ARTISTAS DESTACADOS)
               =============================================================== */}
            {activeTab === 'collabs' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleSaveCollab}
                  className="lg:col-span-5 border border-white/15 bg-[#111113] p-6 space-y-4 h-fit"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.22em] text-[#f02b49] uppercase">
                        ALGUNAS COLABS
                      </p>
                      <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight mt-1">
                        {editingCollabId ? 'EDITAR COLABORACIÓN' : 'NUEVA COLABORACIÓN'}
                      </h2>
                    </div>
                    {editingCollabId && (
                      <button
                        type="button"
                        onClick={resetCollabForm}
                        className="text-xs text-[#aaa6aa] hover:text-white underline"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Nombre / Título de la canción *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={SCHEMA_LIMITS.collabTitle}
                      value={collabTitle}
                      onChange={(e) => setCollabTitle(e.target.value)}
                      placeholder="Ej: SMOKK x Artista — Nombre del tema"
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                        Enlace de YouTube
                      </label>
                      <input
                        type="url"
                        maxLength={SCHEMA_LIMITS.url}
                        value={collabYoutube}
                        onChange={(e) => setCollabYoutube(e.target.value)}
                        placeholder="https://youtu.be/..."
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                        Spotify (opcional)
                      </label>
                      <input
                        type="url"
                        maxLength={SCHEMA_LIMITS.url}
                        value={collabSpotify}
                        onChange={(e) => setCollabSpotify(e.target.value)}
                        placeholder="https://open.spotify.com/..."
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3]">
                        Imagen del recuadro
                      </label>
                      {getYoutubeId(collabYoutube) && (
                        <button
                          type="button"
                          onClick={() => {
                            const id = getYoutubeId(collabYoutube);
                            if (id) {
                              setCollabImagePreview('');
                              setCollabImageUrl(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
                            }
                          }}
                          className="text-[10px] font-bold uppercase tracking-wider text-[#f02b49] hover:underline"
                        >
                          Usar miniatura de YouTube
                        </button>
                      )}
                    </div>
                    <label className="flex items-center justify-center gap-2 border border-dashed border-white/25 hover:border-[#f02b49] bg-[#080809] p-3.5 cursor-pointer text-xs">
                      <Upload className="w-4 h-4 text-[#f02b49]" />
                      <span>
                        {uploadingCollabImg
                          ? 'Subiendo a GitHub…'
                          : collabImageUrl
                            ? 'Cambiar imagen (sube a GitHub)'
                            : 'Subir imagen a GitHub'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingCollabImg}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          void handleCollabImagePick(f);
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      value={collabImageUrl}
                      onChange={(e) => setCollabImageUrl(e.target.value)}
                      placeholder="O pegá ruta/URL: /material/uploads/colabs/..."
                      className="mt-2 w-full bg-[#080809] border border-white/15 px-3 py-1.5 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                    />
                    {(collabImagePreview || collabImageUrl) && (
                      <div className="mt-2 relative">
                        <img
                          src={collabImagePreview || resolveMediaUrl(collabImageUrl)}
                          alt="Portada"
                          className="w-full h-36 object-cover border border-white/15"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCollabImageUrl('');
                            setCollabImagePreview('');
                          }}
                          className="absolute top-2 right-2 px-2 py-1 bg-black/80 border border-white/20 text-[10px] uppercase text-white hover:border-[#f02b49]"
                        >
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Featured Artist Spotlight Link */}
                  <div className="border border-white/15 bg-[#080809] p-4 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={collabFeaturedArtist}
                        onChange={(e) => setCollabFeaturedArtist(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#c10e2e] shrink-0"
                      />
                      <div className="space-y-0.5">
                        <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white">
                          <Star
                            className={`w-3.5 h-3.5 ${
                              collabFeaturedArtist
                                ? 'text-[#f02b49] fill-[#f02b49]'
                                : 'text-[#aaa6aa]'
                            }`}
                          />
                          Destacar artista importante
                        </span>
                        <span className="block text-[11px] text-[#aaa6aa] leading-snug">
                          Muestra la foto y nombre del artista arriba en la sección. Al tocarlo,
                          abre directo la canción en YouTube o Spotify.
                        </span>
                      </div>
                    </label>

                    {collabFeaturedArtist && (
                      <div className="pt-3 border-t border-white/10 space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                            Nombre del artista destacado *
                          </label>
                          <input
                            type="text"
                            required={collabFeaturedArtist}
                            maxLength={SCHEMA_LIMITS.collabArtistName}
                            value={collabArtistName}
                            onChange={(e) => setCollabArtistName(e.target.value)}
                            placeholder="Ej: Damián Córdoba, Lit Killah, Bizarrap…"
                            className="w-full bg-[#111113] border border-white/15 px-3 py-2 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                            Foto del artista
                          </label>
                          <label className="flex items-center justify-center gap-2 border border-dashed border-white/25 hover:border-[#f02b49] bg-[#111113] p-3 cursor-pointer text-xs">
                            <Upload className="w-4 h-4 text-[#f02b49]" />
                            <span>
                              {uploadingArtistImg
                                ? 'Subiendo foto a GitHub…'
                                : collabArtistPhotoUrl
                                  ? 'Cambiar foto del artista (GitHub)'
                                  : 'Subir foto del artista a GitHub'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingArtistImg}
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                void handleCollabArtistPhotoPick(f);
                              }}
                            />
                          </label>
                          <input
                            type="text"
                            value={collabArtistPhotoUrl}
                            onChange={(e) => setCollabArtistPhotoUrl(e.target.value)}
                            placeholder="O pegá ruta/URL: /material/uploads/artistas/..."
                            className="mt-2 w-full bg-[#111113] border border-white/15 px-3 py-1.5 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                          />
                          {(collabArtistPhotoPreview || collabArtistPhotoUrl) && (
                            <div className="mt-2 relative flex items-center gap-3 p-2 bg-[#111113] border border-white/15">
                              <img
                                src={
                                  collabArtistPhotoPreview || resolveMediaUrl(collabArtistPhotoUrl)
                                }
                                alt={collabArtistName || 'Artista destacado'}
                                className="w-16 h-20 object-cover object-top border border-white/15 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-white truncate">
                                  {collabArtistName || 'Vista previa del artista'}
                                </p>
                                <p className="text-[11px] text-[#aaa6aa]">
                                  Lista para mostrarse destacada
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setCollabArtistPhotoUrl('');
                                  setCollabArtistPhotoPreview('');
                                }}
                                className="px-2 py-1 bg-black/80 border border-white/20 text-[10px] uppercase text-white hover:border-[#f02b49]"
                              >
                                Quitar
                              </button>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                            Descripción del artista (opcional)
                          </label>
                          <textarea
                            rows={2}
                            maxLength={SCHEMA_LIMITS.collabArtistDescription}
                            value={collabArtistDesc}
                            onChange={(e) => setCollabArtistDesc(e.target.value)}
                            placeholder="Ej: Composición y colaboración especial…"
                            className="w-full bg-[#111113] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#f02b49] focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Descripción de la canción (opcional)
                    </label>
                    <textarea
                      rows={2}
                      maxLength={SCHEMA_LIMITS.collabDescription}
                      value={collabDesc}
                      onChange={(e) => setCollabDesc(e.target.value)}
                      placeholder="Breve detalle de la colaboración…"
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Ruta / URL de video MP4 en loop (opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={SCHEMA_LIMITS.mediaUrl}
                      value={collabVideoUrl}
                      onChange={(e) => setCollabVideoUrl(e.target.value)}
                      placeholder="/material/uploads/video/clip.mp4 o https://..."
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingCollab || uploadingCollabImg || uploadingArtistImg}
                    className="w-full py-3.5 bg-[#c10e2e] hover:bg-[#e0163a] disabled:opacity-50 text-white text-xs font-extrabold tracking-[0.14em] uppercase flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {savingCollab
                      ? 'Guardando…'
                      : editingCollabId
                        ? 'Actualizar colaboración'
                        : 'Publicar colaboración'}
                  </button>
                </form>

                <div className="lg:col-span-7 border border-white/15 bg-[#111113] p-6 space-y-4">
                  <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight">
                    COLABORACIONES ({collabs.length})
                  </h2>

                  {collabs.length === 0 ? (
                    <div className="border border-dashed border-white/20 p-8 text-center text-sm text-[#aaa6aa]">
                      Todavía no agregaste colaboraciones.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {collabs.map((item) => (
                        <div
                          key={item.id}
                          className={`border bg-[#080809] p-4 flex flex-col gap-3 ${
                            item.isFeaturedArtist ? 'border-[#f02b49]/50' : 'border-white/12'
                          }`}
                        >
                          {item.isFeaturedArtist && (
                            <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/10">
                              {item.artistPhotoUrl ? (
                                <img
                                  src={resolveMediaUrl(item.artistPhotoUrl)}
                                  alt={item.artistName || item.title}
                                  className="w-10 h-10 object-cover object-top border border-[#f02b49]/50 shrink-0"
                                />
                              ) : (
                                <span className="w-10 h-10 bg-[#c10e2e]/20 border border-[#f02b49]/40 grid place-items-center shrink-0">
                                  <Star className="w-4 h-4 text-[#f02b49] fill-[#f02b49]" />
                                </span>
                              )}
                              <div className="min-w-0">
                                <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#f02b49]">
                                  ★ Artista destacado
                                </span>
                                <strong className="block text-xs text-white truncate">
                                  {item.artistName || 'Sin nombre'}
                                </strong>
                              </div>
                            </div>
                          )}

                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-sm text-white">{item.title}</h3>
                            <span className="text-[10px] uppercase tracking-wider text-[#aaa6aa] shrink-0">
                              {item.isPublic ? 'Visible' : 'Oculta'}
                            </span>
                          </div>
                          {item.imageUrl && (
                            <img
                              src={resolveMediaUrl(item.imageUrl)}
                              alt={item.title}
                              className="w-full h-36 object-cover border border-white/10"
                            />
                          )}
                          {(item.artistDescription || item.description) && (
                            <p className="text-xs text-[#aaa6aa] line-clamp-3">
                              {item.isFeaturedArtist && item.artistDescription
                                ? item.artistDescription
                                : item.description}
                            </p>
                          )}
                          <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-white/10">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditCollab(item)}
                                className="text-[11px] font-bold uppercase text-[#f02b49] hover:underline"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleCollabVisibility(item)}
                                className="text-[11px] uppercase text-[#aaa6aa] hover:text-white"
                              >
                                {item.isPublic ? 'Ocultar' : 'Mostrar'}
                              </button>
                            </div>
                            {confirmDeleteCollabId === item.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteCollab(item.id)}
                                  className="px-2 py-1 bg-[#c10e2e] text-white text-[10px] font-bold uppercase"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCollabId(null)}
                                  className="px-2 py-1 border border-white/15 text-[10px]"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCollabId(item.id)}
                                className="text-[#aaa6aa] hover:text-[#f02b49]"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===============================================================
                TAB 5: GENERAL, REDES, PORTADA HERO, VIDEO FONDO & BIO
               =============================================================== */}
            {activeTab === 'general' && (
              <form onSubmit={handleSaveConfig} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Branding & Links */}
                  <section className="border border-white/15 bg-[#111113] p-6 space-y-4">
                    <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight">
                      IDENTIDAD Y REDES
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                          Nombre del artista
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={SCHEMA_LIMITS.artistName}
                          value={config.artistName}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, artistName: e.target.value }))
                          }
                          className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                          Ubicación / Pie de página
                        </label>
                        <input
                          type="text"
                          maxLength={SCHEMA_LIMITS.contactLine}
                          value={config.contactLine}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, contactLine: e.target.value }))
                          }
                          className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                        Subtítulo Hero (Eyebrow)
                      </label>
                      <input
                        type="text"
                        maxLength={SCHEMA_LIMITS.heroEyebrow}
                        value={config.heroEyebrow}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, heroEyebrow: e.target.value }))
                        }
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                          Intro (Arriba)
                        </label>
                        <input
                          type="text"
                          maxLength={SCHEMA_LIMITS.introKicker}
                          value={config.introKicker}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, introKicker: e.target.value }))
                          }
                          className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                          Intro (Abajo)
                        </label>
                        <input
                          type="text"
                          maxLength={SCHEMA_LIMITS.introCaption}
                          value={config.introCaption}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, introCaption: e.target.value }))
                          }
                          className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                        YouTube
                      </label>
                      <input
                        type="url"
                        maxLength={SCHEMA_LIMITS.url}
                        value={config.youtubeUrl}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, youtubeUrl: e.target.value }))
                        }
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                        Spotify
                      </label>
                      <input
                        type="url"
                        maxLength={SCHEMA_LIMITS.url}
                        value={config.spotifyUrl}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, spotifyUrl: e.target.value }))
                        }
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                        Instagram
                      </label>
                      <input
                        type="url"
                        maxLength={SCHEMA_LIMITS.url}
                        value={config.instagramUrl}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, instagramUrl: e.target.value }))
                        }
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </section>

                  {/* Hero Visuals & Bio */}
                  <section className="border border-white/15 bg-[#111113] p-6 space-y-4">
                    <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight">
                      PORTADA Y BIOGRAFÍA
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                          Imagen principal (Hero — en GitHub)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <label className="px-3 py-2 bg-[#080809] border border-white/20 hover:border-[#f02b49] text-xs cursor-pointer">
                            {uploadingPortrait ? 'Subiendo…' : 'Subir foto a GitHub'}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingPortrait}
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                void handleUploadPortraitToGitHub(f);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setPortraitPreview('');
                              setConfig((prev) => ({
                                ...prev,
                                portraitImage: '/material/imagenes/personaje.png',
                              }));
                            }}
                            className="px-3 py-2 border border-white/15 text-xs text-[#aaa6aa] hover:text-white"
                          >
                            Restaurar original
                          </button>
                        </div>
                      </div>
                      <div className="h-28 bg-[#080809] border border-white/10 flex items-center justify-center overflow-hidden">
                        <img
                          src={
                            portraitPreview ||
                            resolveMediaUrl(
                              config.portraitImage || '/material/imagenes/personaje.png'
                            )
                          }
                          alt="Retrato"
                          className="h-full object-contain"
                        />
                      </div>
                    </div>

                    <div className="border border-white/12 bg-[#080809] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3]">
                            Video corto de fondo (alojado en GitHub)
                          </label>
                          <p className="text-[11px] text-[#aaa6aa] mt-0.5">
                            {config.backgroundVideoUrl
                              ? `Activo: ${config.backgroundVideoUrl}`
                              : 'Subí un MP4/WebM en loop a tu repo de GitHub (hasta 24 MB) o pegá su ruta.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className="px-3 py-2 bg-[#c10e2e]/20 hover:bg-[#c10e2e] border border-[#f02b49]/50 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors">
                            {uploadingBgVideo
                              ? 'Subiendo a GitHub…'
                              : config.backgroundVideoUrl
                                ? 'Reemplazar MP4'
                                : 'Subir MP4 a GitHub'}
                            <input
                              type="file"
                              accept="video/mp4,video/webm,.mp4,.webm"
                              disabled={uploadingBgVideo}
                              className="hidden"
                              onChange={(e) => {
                                const picked = e.target.files?.[0];
                                e.target.value = '';
                                void handleUploadBgVideoToGitHub(picked);
                              }}
                            />
                          </label>
                          {config.backgroundVideoUrl && (
                            <button
                              type="button"
                              disabled={uploadingBgVideo || savingConfig}
                              onClick={() => void handleClearBgVideo()}
                              className="px-3 py-2 border border-white/15 hover:border-[#f02b49] text-[11px] font-bold uppercase text-[#aaa6aa] hover:text-[#f02b49]"
                            >
                              Quitar video
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold tracking-[0.14em] uppercase text-[#aaa6aa] mb-1">
                          Ruta en GitHub o enlace MP4
                        </label>
                        <input
                          type="text"
                          maxLength={SCHEMA_LIMITS.backgroundVideoUrl}
                          value={config.backgroundVideoUrl}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, backgroundVideoUrl: e.target.value }))
                          }
                          placeholder="/material/uploads/video/fondo.mp4 o https://..."
                          className="w-full bg-[#111113] border border-white/15 px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                        Bio — Párrafo destacado
                      </label>
                      <textarea
                        rows={2}
                        maxLength={SCHEMA_LIMITS.bioLead}
                        value={config.bioLead}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, bioLead: e.target.value }))
                        }
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                        Bio — Historia
                      </label>
                      <textarea
                        rows={3}
                        maxLength={SCHEMA_LIMITS.bioBody1}
                        value={config.bioBody1}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, bioBody1: e.target.value }))
                        }
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                        Bio — Composición
                      </label>
                      <textarea
                        rows={2}
                        maxLength={SCHEMA_LIMITS.bioBody2}
                        value={config.bioBody2}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, bioBody2: e.target.value }))
                        }
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1">
                        Bio — Créditos y colaboraciones
                      </label>
                      <textarea
                        rows={2}
                        maxLength={SCHEMA_LIMITS.bioCredits}
                        value={config.bioCredits}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, bioCredits: e.target.value }))
                        }
                        className="w-full bg-[#080809] border border-white/15 px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </section>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="px-8 py-3.5 bg-[#c10e2e] hover:bg-[#e0163a] disabled:opacity-50 text-white text-xs font-extrabold tracking-[0.14em] uppercase flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {savingConfig ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
