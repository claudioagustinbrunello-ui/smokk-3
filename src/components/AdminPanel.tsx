import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Film,
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
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import {
  addCollaboration,
  addGalleryItem,
  checkIsAdmin,
  createTrackWithMp3,
  createTrackWithUrl,
  deleteBackgroundVideo,
  deleteCollaboration,
  deleteGalleryItem,
  deleteTrackWithChunks,
  fetchAllCollaborationsAdmin,
  fetchAllGalleryAdmin,
  fetchAllTracksAdmin,
  fetchBackgroundVideoMeta,
  fetchSiteConfig,
  fetchTrackAudioUrl,
  replaceTrackMp3,
  saveSiteConfig,
  updateCollaboration,
  updateGalleryItem,
  updateTrackMeta,
  uploadOrReplaceBackgroundVideo,
} from '../services/cms';
import {
  Collaboration,
  DEFAULT_SITE_CONFIG,
  GalleryItem,
  MediaAsset,
  SCHEMA_LIMITS,
  SiteConfig,
  Track,
} from '../types';
import { compressImageToDataUrl, formatBytes, getYoutubeId } from '../utils/media';

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

  // CMS data
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [collabs, setCollabs] = useState<Collaboration[]>([]);
  const [bgVideoMeta, setBgVideoMeta] = useState<MediaAsset | null>(null);

  // Saving flags
  const [savingConfig, setSavingConfig] = useState(false);
  const [uploadingBgVideo, setUploadingBgVideo] = useState(false);
  const [bgVideoProgress, setBgVideoProgress] = useState<{ done: number; total: number } | null>(
    null
  );

  // Track creation state
  const [trackSourceMode, setTrackSourceMode] = useState<'upload' | 'url'>('upload');
  const [newTrackTitle, setNewTrackTitle] = useState('');
  const [newTrackArtist, setNewTrackArtist] = useState('SMOKK');
  const [newTrackUrl, setNewTrackUrl] = useState('');
  const [newTrackFile, setNewTrackFile] = useState<File | null>(null);
  const [uploadingTrack, setUploadingTrack] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  // Track replace & edit & preview
  const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState<{ done: number; total: number } | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTrackTitle, setEditTrackTitle] = useState('');
  const [editTrackArtist, setEditTrackArtist] = useState('');
  const [editTrackOrder, setEditTrackOrder] = useState(1);
  const [confirmDeleteTrackId, setConfirmDeleteTrackId] = useState<string | null>(null);

  // Inline audio preview
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map());
  const replaceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Gallery creation state
  const [newGalleryTitle, setNewGalleryTitle] = useState('');
  const [newGalleryImageUrl, setNewGalleryImageUrl] = useState('');
  const [savingGallery, setSavingGallery] = useState(false);
  const [confirmDeleteGalleryId, setConfirmDeleteGalleryId] = useState<string | null>(null);

  // Collaboration creation/edit state
  const [editingCollabId, setEditingCollabId] = useState<string | null>(null);
  const [collabTitle, setCollabTitle] = useState('');
  const [collabDesc, setCollabDesc] = useState('');
  const [collabImageUrl, setCollabImageUrl] = useState('');
  const [collabVideoUrl, setCollabVideoUrl] = useState('');
  const [collabYoutube, setCollabYoutube] = useState('');
  const [collabSpotify, setCollabSpotify] = useState('');
  const [savingCollab, setSavingCollab] = useState(false);
  const [confirmDeleteCollabId, setConfirmDeleteCollabId] = useState<string | null>(null);

  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Cleanup preview object URLs
  useEffect(() => {
    const cache = previewUrlCacheRef.current;
    return () => {
      cache.forEach((url) => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      cache.clear();
    };
  }, []);

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

  const loadAllAdminData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [cfg, trk, gal, col, bgVid] = await Promise.all([
        fetchSiteConfig(),
        fetchAllTracksAdmin(),
        fetchAllGalleryAdmin(),
        fetchAllCollaborationsAdmin(),
        fetchBackgroundVideoMeta(),
      ]);
      setConfig(cfg);
      setTracks(trk);
      setGallery(gal);
      setCollabs(col);
      setBgVideoMeta(bgVid);
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'No se pudieron cargar los datos de Firebase.'
      );
    } finally {
      setLoadingData(false);
    }
  }, [showToast]);

  const handleUploadBgVideo = async (file: File | undefined) => {
    if (!file || !user) return;
    setUploadingBgVideo(true);
    setBgVideoProgress(null);
    try {
      await uploadOrReplaceBackgroundVideo(file, user.uid, (done, total) =>
        setBgVideoProgress({ done, total })
      );
      await loadAllAdminData();
      showToast('ok', 'Video de fondo subido y activo en la página.');
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'No se pudo subir el video de fondo.'
      );
    } finally {
      setUploadingBgVideo(false);
      setBgVideoProgress(null);
    }
  };

  const handleDeleteBgVideo = async () => {
    setUploadingBgVideo(true);
    try {
      await deleteBackgroundVideo();
      await loadAllAdminData();
      showToast('ok', 'Video de fondo eliminado.');
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'No se pudo eliminar el video de fondo.'
      );
    } finally {
      setUploadingBgVideo(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void loadAllAdminData();
    }
  }, [isAdmin, loadAllAdminData]);

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
  // AUDIO PREVIEW
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
    setPreviewLoadingId(track.id);
    try {
      let url = previewUrlCacheRef.current.get(track.id);
      if (!url) {
        url = await fetchTrackAudioUrl(track, true);
        previewUrlCacheRef.current.set(track.id, url);
      }
      const audio = previewAudioRef.current;
      if (audio) {
        audio.src = url;
        await audio.play();
        setPreviewTrackId(track.id);
      }
    } catch (err) {
      showToast(
        'err',
        err instanceof Error ? err.message : 'No se pudo reproducir el archivo MP3.'
      );
    } finally {
      setPreviewLoadingId(null);
    }
  };

  // =========================================================================
  // TRACK HANDLERS (UPLOAD / REPLACE / EDIT / DELETE)
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
    setUploadProgress(null);

    try {
      const nextOrder = tracks.length > 0 ? Math.max(...tracks.map((t) => t.order)) + 1 : 1;

      if (trackSourceMode === 'upload') {
        if (!newTrackFile) {
          showToast('err', 'Seleccioná un archivo MP3 para subir.');
          setUploadingTrack(false);
          return;
        }
        await createTrackWithMp3(
          {
            title,
            artist,
            file: newTrackFile,
            order: nextOrder,
            isPublic: true,
          },
          user.uid,
          (done, total) => setUploadProgress({ done, total })
        );
      } else {
        if (!newTrackUrl.trim()) {
          showToast('err', 'Pegá una URL directa al archivo MP3.');
          setUploadingTrack(false);
          return;
        }
        await createTrackWithUrl(
          {
            title,
            artist,
            audioUrl: newTrackUrl.trim(),
            order: nextOrder,
            isPublic: true,
          },
          user.uid
        );
      }

      setNewTrackTitle('');
      setNewTrackArtist(config.artistName || 'SMOKK');
      setNewTrackFile(null);
      setNewTrackUrl('');
      setUploadProgress(null);
      await loadAllAdminData();
      showToast('ok', 'Canción subida y activa en la página pública.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al subir la canción.');
    } finally {
      setUploadingTrack(false);
    }
  };

  const handleReplaceMp3 = async (track: Track, file: File | undefined) => {
    if (!file || !user) return;
    stopPreview();
    setReplacingTrackId(track.id);
    setReplaceProgress(null);

    try {
      await replaceTrackMp3(track, file, user.uid, (done, total) =>
        setReplaceProgress({ done, total })
      );
      // Invalidate cached preview URL for this track
      const oldUrl = previewUrlCacheRef.current.get(track.id);
      if (oldUrl && oldUrl.startsWith('blob:')) {
        URL.revokeObjectURL(oldUrl);
      }
      previewUrlCacheRef.current.delete(track.id);

      await loadAllAdminData();
      showToast('ok', `MP3 reemplazado en "${track.title}".`);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo reemplazar el MP3.');
    } finally {
      setReplacingTrackId(null);
      setReplaceProgress(null);
    }
  };

  const startEditTrack = (track: Track) => {
    setEditingTrackId(track.id);
    setEditTrackTitle(track.title);
    setEditTrackArtist(track.artist);
    setEditTrackOrder(track.order);
  };

  const saveEditTrack = async (track: Track) => {
    try {
      await updateTrackMeta(track, {
        title: editTrackTitle.trim() || track.title,
        artist: editTrackArtist.trim() || track.artist,
        order: Number(editTrackOrder) || 1,
      });
      setEditingTrackId(null);
      await loadAllAdminData();
      showToast('ok', 'Datos de la canción actualizados.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al actualizar canción.');
    }
  };

  const toggleTrackVisibility = async (track: Track) => {
    try {
      await updateTrackMeta(track, { isPublic: !track.isPublic });
      await loadAllAdminData();
      showToast(
        'ok',
        !track.isPublic ? 'Canción activada en la web.' : 'Canción ocultada de la web.'
      );
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al cambiar visibilidad.');
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    stopPreview();
    try {
      await deleteTrackWithChunks(trackId);
      const oldUrl = previewUrlCacheRef.current.get(trackId);
      if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
      previewUrlCacheRef.current.delete(trackId);
      setConfirmDeleteTrackId(null);
      await loadAllAdminData();
      showToast('ok', 'Canción eliminada.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al eliminar la canción.');
    }
  };

  // =========================================================================
  // CONFIG HANDLERS
  // =========================================================================
  const handleSaveConfig = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) return;
    setSavingConfig(true);
    try {
      await saveSiteConfig(config, user.uid);
      showToast('ok', 'Cambios guardados y publicados en la página.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al guardar configuración.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleConfigImageUpload = async (
    file: File | undefined,
    field: 'portraitImage' | 'backgroundImage'
  ) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 1400, 520000);
      setConfig((prev) => ({ ...prev, [field]: dataUrl }));
      showToast('ok', 'Imagen procesada. Tocá "Guardar cambios" para publicarla.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'No se pudo procesar la imagen.');
    }
  };

  // =========================================================================
  // GALLERY HANDLERS
  // =========================================================================
  const handleGalleryFilePick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 1400, 500000);
      setNewGalleryImageUrl(dataUrl);
      if (!newGalleryTitle.trim()) {
        setNewGalleryTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al comprimir imagen.');
    }
  };

  const handleAddGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newGalleryImageUrl.trim()) {
      showToast('err', 'Subí una foto o pegá la URL de la imagen.');
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
      await loadAllAdminData();
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
      await loadAllAdminData();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al actualizar imagen.');
    }
  };

  const handleDeleteGallery = async (id: string) => {
    try {
      await deleteGalleryItem(id);
      setConfirmDeleteGalleryId(null);
      await loadAllAdminData();
      showToast('ok', 'Imagen eliminada.');
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al eliminar imagen.');
    }
  };

  // =========================================================================
  // COLLABORATIONS HANDLERS
  // =========================================================================
  const resetCollabForm = () => {
    setEditingCollabId(null);
    setCollabTitle('');
    setCollabDesc('');
    setCollabImageUrl('');
    setCollabVideoUrl('');
    setCollabYoutube('');
    setCollabSpotify('');
  };

  const handleCollabImagePick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, 1200, 500000);
      setCollabImageUrl(dataUrl);
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al procesar imagen.');
    }
  };

  const handleSaveCollab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!collabTitle.trim()) {
      showToast('err', 'Ingresá el título de la colaboración.');
      return;
    }
    setSavingCollab(true);
    try {
      if (editingCollabId) {
        const existing = collabs.find((c) => c.id === editingCollabId);
        await updateCollaboration(editingCollabId, {
          title: collabTitle.trim(),
          description: collabDesc.trim(),
          imageUrl: collabImageUrl.trim(),
          videoUrl: collabVideoUrl.trim(),
          youtubeUrl: collabYoutube.trim(),
          spotifyUrl: collabSpotify.trim(),
          order: existing?.order ?? 1,
          isPublic: existing?.isPublic ?? true,
        });
        showToast('ok', 'Colaboración actualizada.');
      } else {
        const nextOrder = collabs.length > 0 ? Math.max(...collabs.map((c) => c.order)) + 1 : 1;
        await addCollaboration(
          {
            title: collabTitle.trim(),
            description: collabDesc.trim(),
            imageUrl: collabImageUrl.trim(),
            videoUrl: collabVideoUrl.trim(),
            youtubeUrl: collabYoutube.trim(),
            spotifyUrl: collabSpotify.trim(),
            order: nextOrder,
            isPublic: true,
          },
          user.uid
        );
        showToast('ok', 'Colaboración publicada.');
      }
      resetCollabForm();
      await loadAllAdminData();
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
    setCollabVideoUrl(item.videoUrl);
    setCollabYoutube(item.youtubeUrl);
    setCollabSpotify(item.spotifyUrl);
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
        order: item.order,
        isPublic: !item.isPublic,
      });
      await loadAllAdminData();
    } catch (err) {
      showToast('err', err instanceof Error ? err.message : 'Error al actualizar colaboración.');
    }
  };

  const handleDeleteCollab = async (id: string) => {
    try {
      await deleteCollaboration(id);
      setConfirmDeleteCollabId(null);
      if (editingCollabId === id) resetCollabForm();
      await loadAllAdminData();
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

  // =========================================================================
  // RENDER: AUTHORIZED ADMIN PANEL
  // =========================================================================
  const previewYoutubeId = getYoutubeId(config.featuredVideoUrl) || 'u9YXc_-Qgec';

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
            Cargando contenido desde Firebase…
          </div>
        ) : (
          <>
            {/* ===============================================================
                TAB 1: MÚSICA (MP3 UPLOAD + ONE-CLICK REPLACE)
               =============================================================== */}
            {activeTab === 'music' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Upload Form */}
                <section className="lg:col-span-5 border border-white/15 bg-[#111113] p-6 space-y-5 h-fit">
                  <div>
                    <p className="text-[11px] font-bold tracking-[0.22em] text-[#f02b49] uppercase">
                      NUEVA CANCIÓN
                    </p>
                    <h2 className="font-['Barlow_Condensed'] text-3xl font-black tracking-tight mt-1">
                      SUBIR MP3 A FIREBASE
                    </h2>
                    <p className="text-xs text-[#aaa6aa] mt-1">
                      La primera canción activa suena automáticamente cuando alguien toca “Entrar
                      con música”. Podés reemplazar el archivo MP3 cuando quieras.
                    </p>
                  </div>

                  {/* Mode Switch */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTrackSourceMode('upload')}
                      className={`py-2.5 px-3 text-[11px] font-extrabold tracking-[0.1em] uppercase border ${
                        trackSourceMode === 'upload'
                          ? 'bg-[#c10e2e]/20 border-[#f02b49] text-white'
                          : 'border-white/10 text-[#aaa6aa]'
                      }`}
                    >
                      Subir archivo MP3
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
                      URL externa MP3
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

                    {trackSourceMode === 'upload' ? (
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                          Archivo MP3 (hasta 15 MB) *
                        </label>
                        <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/25 hover:border-[#f02b49] bg-[#080809] p-5 text-center cursor-pointer transition-colors">
                          <Upload className="w-5 h-5 text-[#f02b49]" />
                          <span className="text-xs font-semibold text-white">
                            {newTrackFile ? newTrackFile.name : 'Elegí tu archivo .mp3'}
                          </span>
                          <span className="text-[11px] text-[#aaa6aa]">
                            {newTrackFile
                              ? `${formatBytes(newTrackFile.size)} · Listo para subir`
                              : 'Formatos: MP3, M4A, WAV, OGG · Máx 15 MB'}
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
                          Enlace directo al MP3 *
                        </label>
                        <input
                          type="url"
                          required
                          maxLength={SCHEMA_LIMITS.mediaUrl}
                          value={newTrackUrl}
                          onChange={(e) => setNewTrackUrl(e.target.value)}
                          placeholder="https://.../cancion.mp3"
                          className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                        />
                      </div>
                    )}

                    {uploadProgress && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-[#d3ced0]">
                          <span>Subiendo MP3 a Firebase…</span>
                          <span>
                            {uploadProgress.done}/{uploadProgress.total} bloques
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-[#f02b49] transition-all"
                            style={{
                              width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={uploadingTrack}
                      className="w-full py-3.5 bg-[#c10e2e] hover:bg-[#e0163a] disabled:opacity-50 text-white text-xs font-extrabold tracking-[0.14em] uppercase flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {uploadingTrack ? 'Subiendo canción…' : 'Guardar canción'}
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
                      Todavía no subiste ninguna canción. Usá el formulario de la izquierda para
                      cargar tu primer MP3.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tracks.map((track, idx) => {
                        const isReplacing = replacingTrackId === track.id;
                        const isEditing = editingTrackId === track.id;
                        const isPlayingPreview = previewTrackId === track.id;
                        const isLoadingPreview = previewLoadingId === track.id;

                        return (
                          <div
                            key={track.id}
                            className="border border-white/12 bg-[#080809] p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <button
                                  type="button"
                                  disabled={isLoadingPreview || isReplacing}
                                  onClick={() => void togglePreviewTrack(track)}
                                  title={isPlayingPreview ? 'Detener vista previa' : 'Escuchar MP3'}
                                  className="w-10 h-10 bg-[#221015] hover:bg-[#c10e2e] border border-[#f02b49]/35 grid place-items-center shrink-0 transition-colors"
                                >
                                  {isLoadingPreview ? (
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : isPlayingPreview ? (
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
                                  </div>
                                  <p className="text-xs text-[#aaa6aa] mt-0.5">
                                    {track.artist} ·{' '}
                                    {track.sourceType === 'upload'
                                      ? `${track.fileName || 'MP3'} (${formatBytes(track.fileSize)})`
                                      : 'URL externa'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {/* Replace MP3 button */}
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
                                  Reemplazar MP3
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
                                      onClick={() => void handleDeleteTrack(track.id)}
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

                            {isReplacing && replaceProgress && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-[11px] text-[#ffd2d9]">
                                  <span>Reemplazando archivo MP3…</span>
                                  <span>
                                    {replaceProgress.done}/{replaceProgress.total} bloques
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-white/10">
                                  <div
                                    className="h-full bg-[#f02b49]"
                                    style={{
                                      width: `${Math.round((replaceProgress.done / replaceProgress.total) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            {isEditing && (
                              <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                <div className="sm:col-span-5">
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
                                <div className="sm:col-span-4">
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
                                <div className="sm:col-span-2">
                                  <button
                                    type="button"
                                    onClick={() => void saveEditTrack(track)}
                                    className="w-full py-2 bg-[#c10e2e] hover:bg-[#e0163a] text-white text-[11px] font-extrabold uppercase"
                                  >
                                    Guardar
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
                      className="w-full h-full border-0"
                      src={`https://www.youtube-nocookie.com/embed/${previewYoutubeId}`}
                      title="Vista previa YouTube"
                      allowFullScreen
                    />
                  </div>
                  <p className="text-xs tracking-[0.14em] text-[#d4cdd0] uppercase">
                    {config.featuredVideoTitle}
                  </p>
                </div>
              </form>
            )}

            {/* ===============================================================
                TAB 3: GALERÍA (OTROS PLANOS)
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
                    <span className="text-xs font-semibold">Subir foto desde tu dispositivo</span>
                    <span className="text-[11px] text-[#aaa6aa]">
                      Se optimiza automáticamente para cargar rápido
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleGalleryFilePick(e.target.files?.[0])}
                    />
                  </label>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      O pegá una URL de imagen
                    </label>
                    <input
                      type="text"
                      value={newGalleryImageUrl.startsWith('data:') ? '' : newGalleryImageUrl}
                      onChange={(e) => setNewGalleryImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  {newGalleryImageUrl && (
                    <div className="border border-white/15 bg-black overflow-hidden">
                      <img
                        src={newGalleryImageUrl}
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
                    disabled={savingGallery}
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
                            src={item.imageUrl}
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
                TAB 4: COLABORACIONES (ALGUNAS COLABS)
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
                      <span>{collabImageUrl ? 'Cambiar imagen' : 'Subir imagen del recuadro'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleCollabImagePick(e.target.files?.[0])}
                      />
                    </label>
                    {collabImageUrl && (
                      <div className="mt-2 relative">
                        <img
                          src={collabImageUrl}
                          alt="Portada"
                          className="w-full h-36 object-cover border border-white/15"
                        />
                        <button
                          type="button"
                          onClick={() => setCollabImageUrl('')}
                          className="absolute top-2 right-2 px-2 py-1 bg-black/80 border border-white/20 text-[10px] uppercase text-white hover:border-[#f02b49]"
                        >
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.14em] uppercase text-[#c5c0c3] mb-1.5">
                      Descripción (opcional)
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
                      URL de video MP4 en loop (opcional)
                    </label>
                    <input
                      type="url"
                      maxLength={SCHEMA_LIMITS.mediaUrl}
                      value={collabVideoUrl}
                      onChange={(e) => setCollabVideoUrl(e.target.value)}
                      placeholder="https://.../clip.mp4"
                      className="w-full bg-[#080809] border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-[#f02b49] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingCollab}
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
                          className="border border-white/12 bg-[#080809] p-4 flex flex-col gap-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-sm text-white">{item.title}</h3>
                            <span className="text-[10px] uppercase tracking-wider text-[#aaa6aa]">
                              {item.isPublic ? 'Visible' : 'Oculta'}
                            </span>
                          </div>
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-36 object-cover border border-white/10"
                            />
                          )}
                          {item.description && (
                            <p className="text-xs text-[#aaa6aa] line-clamp-3">
                              {item.description}
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
                TAB 5: GENERAL, REDES, IMAGEN PORTADA & BIOGRAFÍA
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
                          Imagen principal (Hero)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <label className="px-3 py-2 bg-[#080809] border border-white/20 hover:border-[#f02b49] text-xs cursor-pointer">
                            Cambiar foto
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                void handleConfigImageUpload(e.target.files?.[0], 'portraitImage')
                              }
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setConfig((prev) => ({
                                ...prev,
                                portraitImage: '/material/imagenes/personaje.png',
                              }))
                            }
                            className="px-3 py-2 border border-white/15 text-xs text-[#aaa6aa] hover:text-white"
                          >
                            Restaurar original
                          </button>
                        </div>
                      </div>
                      <div className="h-28 bg-[#080809] border border-white/10 flex items-center justify-center overflow-hidden">
                        <img
                          src={
                            !config.portraitImage ||
                            config.portraitImage === '/material/imagenes/personaje.png'
                              ? `${import.meta.env.BASE_URL}material/imagenes/personaje.png`
                              : config.portraitImage
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
                            Video corto de fondo (toda la página)
                          </label>
                          <p className="text-[11px] text-[#aaa6aa] mt-0.5">
                            {bgVideoMeta
                              ? `Cargado: ${bgVideoMeta.fileName} (${formatBytes(bgVideoMeta.fileSize)})`
                              : 'Subí un clip MP4/WebM liviano en loop (hasta 15 MB) o pegá una URL.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className="px-3 py-2 bg-[#c10e2e]/20 hover:bg-[#c10e2e] border border-[#f02b49]/50 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors">
                            {bgVideoMeta ? 'Reemplazar MP4' : 'Subir MP4'}
                            <input
                              type="file"
                              accept="video/mp4,video/webm,.mp4,.webm"
                              disabled={uploadingBgVideo}
                              className="hidden"
                              onChange={(e) => {
                                const picked = e.target.files?.[0];
                                e.target.value = '';
                                void handleUploadBgVideo(picked);
                              }}
                            />
                          </label>
                          {bgVideoMeta && (
                            <button
                              type="button"
                              disabled={uploadingBgVideo}
                              onClick={() => void handleDeleteBgVideo()}
                              className="px-3 py-2 border border-white/15 hover:border-[#f02b49] text-[11px] font-bold uppercase text-[#aaa6aa] hover:text-[#f02b49]"
                            >
                              Quitar video
                            </button>
                          )}
                        </div>
                      </div>

                      {uploadingBgVideo && bgVideoProgress && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-[#ffd2d9]">
                            <span>Subiendo video de fondo a Firebase…</span>
                            <span>
                              {bgVideoProgress.done}/{bgVideoProgress.total} bloques
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10">
                            <div
                              className="h-full bg-[#f02b49]"
                              style={{
                                width: `${Math.round((bgVideoProgress.done / bgVideoProgress.total) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-bold tracking-[0.14em] uppercase text-[#aaa6aa] mb-1">
                          O enlace externo MP4 (opcional)
                        </label>
                        <input
                          type="url"
                          maxLength={SCHEMA_LIMITS.backgroundVideoUrl}
                          value={config.backgroundVideoUrl}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, backgroundVideoUrl: e.target.value }))
                          }
                          placeholder="https://.../fondo.mp4"
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
