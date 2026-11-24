import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, MotionConfig, useScroll, useSpring, useTransform } from 'motion/react';
import { fetchPublicSiteBundle } from '../services/cms';
import {
  Collaboration,
  DEFAULT_SITE_CONFIG,
  GalleryItem,
  SiteConfig,
  Track,
} from '../types';
import { getYoutubeId, resolveMediaUrl, safeExternalLink } from '../utils/media';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PublicSiteProps {
  onOpenAdmin: () => void;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];
const VIEWPORT_CFG = { once: true, amount: 0.16 } as const;

export const PublicSite: React.FC<PublicSiteProps> = ({ onOpenAdmin }) => {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);

  const [entered, setEntered] = useState(false);
  const [introLeaving, setIntroLeaving] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [statusTitle, setStatusTitle] = useState('Elegí “Entrar con música” al comenzar');
  const [statusArtist, setStatusArtist] = useState('SMOKK');
  const [bottomStatus, setBottomStatus] = useState('Experiencia musical');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [bgImgFailed, setBgImgFailed] = useState(false);
  const [showAllCollabs, setShowAllCollabs] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const musicEnabledRef = useRef<boolean>(false);

  // Scroll-scrubbed depth recede for the hero artist portrait: starts sharp & forward, recedes & softens on scroll down
  const { scrollY } = useScroll();
  const smoothScroll = useSpring(scrollY, { stiffness: 130, damping: 24, mass: 0.35 });
  const portraitOpacity = useTransform(smoothScroll, [0, 260], [1, 0.28]);
  const portraitScale = useTransform(smoothScroll, [0, 280], [1.06, 0.86]);
  const portraitX = useTransform(smoothScroll, [0, 260], [0, 28]);
  const portraitY = useTransform(smoothScroll, [0, 260], [0, 28]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    musicEnabledRef.current = musicEnabled;
  }, [musicEnabled]);

  // Lock body scroll while intro overlay is shown
  useEffect(() => {
    if (!entered) {
      document.body.classList.add('locked');
    } else {
      document.body.classList.remove('locked');
    }
    return () => {
      document.body.classList.remove('locked');
    };
  }, [entered]);

  // Update document title when config changes
  useEffect(() => {
    if (config.artistName) {
      document.title = `${config.artistName} — Experiencia oficial`;
    }
  }, [config.artistName]);

  // Load lightweight text/link bundle (cached in browser for 30 min; media files load from GitHub Pages)
  useEffect(() => {
    let active = true;

    async function loadAll() {
      try {
        const forceRefresh = new URLSearchParams(window.location.search).has('refresh');
        const bundle = await fetchPublicSiteBundle(forceRefresh);
        if (!active) return;

        setConfig(bundle.config);
        setPortraitFailed(false);
        setBgImgFailed(false);
        setGallery(bundle.gallery);
        setCollaborations(bundle.collaborations);
        setTracks(bundle.tracks);
        tracksRef.current = bundle.tracks;

        if (!bundle.tracks.length) {
          setStatusTitle('Todavía no hay canciones cargadas');
          setStatusArtist(bundle.config.artistName || 'SMOKK');
        } else {
          const firstUrl = resolveMediaUrl(bundle.tracks[0].audioUrl);
          if (audioRef.current && firstUrl) {
            audioRef.current.src = firstUrl;
            audioRef.current.load();
          }
        }
      } finally {
        if (active) {
          setAudioReady(true);
        }
      }
    }

    void loadAll();

    return () => {
      active = false;
    };
  }, []);

  // PWA install prompt handling
  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setBottomStatus('Aplicación instalada');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const playTrackByIndex = useCallback(
    (index: number) => {
      const list = tracksRef.current;
      const audio = audioRef.current;
      if (!list.length || !audio) return;

      const normalized = ((index % list.length) + list.length) % list.length;
      currentIndexRef.current = normalized;
      setCurrentTrackIndex(normalized);

      const track = list[normalized];
      const title = track.title || config.artistName;
      const artist = track.artist || config.artistName;
      const label = `${title} — ${artist}`;

      setStatusTitle(title);
      setStatusArtist(artist);
      setBottomStatus(label);

      const url = resolveMediaUrl(track.audioUrl);
      if (!url) {
        setStatusTitle('No se pudo reproducir la canción');
        setStatusArtist('Revisá el archivo cargado en el panel de administración');
        setIsPlaying(false);
        return;
      }

      if (audio.src !== new URL(url, window.location.href).href) {
        audio.src = url;
      }
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          setStatusTitle('No se pudo iniciar el audio');
          setStatusArtist('Revisá el archivo de la canción en el panel admin');
          setIsPlaying(false);
        });
      }
    },
    [config.artistName]
  );

  const handleEnter = (withMusic: boolean) => {
    setMusicEnabled(withMusic);
    musicEnabledRef.current = withMusic;
    setIntroLeaving(true);

    if (withMusic && tracksRef.current.length > 0) {
      playTrackByIndex(0);
    } else if (withMusic && tracksRef.current.length === 0) {
      setStatusTitle('Todavía no hay canciones cargadas');
      setStatusArtist('Subí tu MP3 desde el panel /admin');
    } else if (!withMusic) {
      setStatusTitle('Entraste en modo sin música');
      setStatusArtist(config.artistName);
      setBottomStatus('Experiencia musical');
    }

    window.setTimeout(() => {
      setEntered(true);
    }, 560);
  };

  const handleAudioEnded = () => {
    if (musicEnabledRef.current && tracksRef.current.length > 0) {
      void playTrackByIndex(currentIndexRef.current + 1);
    }
  };

  const handleAudioPlay = () => {
    setIsPlaying(true);
    const track = tracksRef.current[currentIndexRef.current];
    if (track) {
      const label = `${track.title} — ${track.artist}`;
      setStatusTitle(track.title);
      setStatusArtist(track.artist);
      setBottomStatus(label);
    }
  };

  const handleAudioPause = () => {
    setIsPlaying(false);
    if (musicEnabledRef.current) {
      setBottomStatus('Música en pausa');
    }
  };

  const handleAudioError = () => {
    if (musicEnabledRef.current && tracksRef.current.length > 1) {
      void playTrackByIndex(currentIndexRef.current + 1);
      return;
    }
    setIsPlaying(false);
    if (musicEnabledRef.current && tracksRef.current.length > 0) {
      setStatusTitle('No se pudo reproducir la canción');
      setStatusArtist('Verificá el MP3 cargado desde el panel de administración');
    }
  };

  const handleInstallClick = async () => {
    if (!installPrompt) {
      setBottomStatus('En iPhone: Compartir → Añadir a pantalla de inicio');
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const youtubeHref = safeExternalLink(config.youtubeUrl) || 'https://youtube.com/@smokk_2009';
  const spotifyHref =
    safeExternalLink(config.spotifyUrl) ||
    'https://open.spotify.com/artist/6lcmuIRdh6cglv54iYnhH6';
  const instagramHref = safeExternalLink(config.instagramUrl) || 'https://instagram.com/smokk.la';
  const featuredYoutubeId = getYoutubeId(config.featuredVideoUrl) || 'u9YXc_-Qgec';
  const activeTrack = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null;
  const tickerText = activeTrack
    ? `${activeTrack.title} — ${activeTrack.artist}`
    : config.artistName;
  const showTicker = entered && musicEnabled && isPlaying;
  const currentYear = new Date().getFullYear();

  const resolvedPortrait = resolveMediaUrl(
    config.portraitImage || '/material/imagenes/personaje.png'
  );
  const resolvedBackgroundImage = resolveMediaUrl(config.backgroundImage);
  const resolvedBackgroundVideo = resolveMediaUrl(config.backgroundVideoUrl);

  return (
    <MotionConfig reducedMotion="user">
      <audio
        ref={audioRef}
        id="audioPlayer"
        preload="auto"
        onEnded={handleAudioEnded}
        onPlay={handleAudioPlay}
        onPause={handleAudioPause}
        onError={handleAudioError}
      />

      {!entered && (
        <div
          className={`intro${introLeaving ? ' leaving' : ''}`}
          id="intro"
          aria-label={`Introducción ${config.artistName}`}
        >
          <div className="intro-glow" />
          <p className="intro-kicker">{config.introKicker}</p>
          <h1 className="intro-name">{config.artistName}</h1>
          <p className="intro-caption">{config.introCaption}</p>
          <div className="intro-actions">
            <button
              id="enterMusic"
              type="button"
              disabled={!audioReady}
              onClick={() => handleEnter(true)}
              className="smokk-btn button-red"
            >
              {audioReady ? 'Entrar con música' : 'PREPARANDO MÚSICA…'}
            </button>
            <button
              id="enterSilent"
              type="button"
              onClick={() => handleEnter(false)}
              className="smokk-btn button-outline"
            >
              Entrar sin música
            </button>
          </div>
        </div>
      )}

      <div id="site" className="site" hidden={!entered}>
        <div className="video-backdrop" aria-hidden="true">
          {resolvedBackgroundVideo ? (
            <video
              id="backgroundVideo"
              src={resolvedBackgroundVideo}
              autoPlay
              muted
              playsInline
              loop
            />
          ) : null}
          <div className="video-shade" />
          <div className="red-haze" />
        </div>

        <header className="topbar">
          <a className="wordmark" href="#inicio" aria-label={`${config.artistName} inicio`}>
            {config.artistName}
          </a>
          <nav aria-label="Navegación principal">
            <a href="#musica">MÚSICA</a>
            <a href="#historia">ARTISTA</a>
            <a href="#colaboraciones">COLABS</a>
            <a href="#lanzamiento">VIDEOS</a>
          </nav>
        </header>

        <main>
          {/* 01 / HERO — Portrait scales larger and reveals progressively on first scroll */}
          <section id="inicio" className="hero scene">
            <motion.div
              className="hero-copy"
              initial={{ opacity: 0, x: -34 }}
              animate={entered ? { opacity: 1, x: 0 } : { opacity: 0, x: -34 }}
              transition={{ duration: 0.75, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">{config.heroEyebrow}</p>
              <h1 className="hero-title">{config.artistName}</h1>
              <a className="text-link" href="#musica">
                DESCUBRIR LA MÚSICA <span>↓</span>
              </a>
            </motion.div>

            <motion.div
              className="hero-art"
              aria-hidden="true"
              style={{
                opacity: portraitOpacity,
                scale: portraitScale,
                x: portraitX,
                y: portraitY,
              }}
            >
              {resolvedBackgroundImage && !bgImgFailed ? (
                <img
                  className="hero-art-background"
                  src={resolvedBackgroundImage}
                  alt=""
                  onError={() => setBgImgFailed(true)}
                />
              ) : null}
              {!portraitFailed && (
                <img
                  id="artistPortrait"
                  className="hero-art-person"
                  src={resolvedPortrait}
                  alt=""
                  onError={() => setPortraitFailed(true)}
                />
              )}
            </motion.div>

            <div className="hero-bottom">
              <span>01 / UNIVERSO</span>
              <span>DESLIZÁ PARA EXPLORAR</span>
            </div>
          </section>

          {/* PLATAFORMAS — Heading enters from left, buttons cascade upward */}
          <section className="platform-access section" aria-label="Accesos oficiales a las plataformas">
            <motion.div
              className="platform-access-heading"
              initial={{ opacity: 0, x: -48 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">CONECTÁ CON {config.artistName}</p>
              <h2>
                ENCONTRALO EN <span>PLATAFORMAS</span>
              </h2>
              <p>Accedé directamente a su música y contenido.</p>
            </motion.div>

            <div className="platform-buttons" id="platformButtons">
              <motion.a
                className="platform-button platform-youtube"
                href={youtubeHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir canal de ${config.artistName} en YouTube`}
                initial={{ opacity: 0, y: 28, scale: 0.94 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={VIEWPORT_CFG}
                transition={{ duration: 0.55, delay: 0.05, ease: EASE_OUT_EXPO }}
              >
                <span className="platform-symbol" aria-hidden="true">
                  ▶
                </span>
                <span>YouTube</span>
                <span className="platform-arrow" aria-hidden="true">
                  ↗
                </span>
              </motion.a>
              <motion.a
                className="platform-button platform-spotify"
                href={spotifyHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir perfil de ${config.artistName} en Spotify`}
                initial={{ opacity: 0, y: 28, scale: 0.94 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={VIEWPORT_CFG}
                transition={{ duration: 0.55, delay: 0.14, ease: EASE_OUT_EXPO }}
              >
                <span className="platform-symbol platform-spotify-symbol" aria-hidden="true">
                  ≋
                </span>
                <span>Spotify</span>
                <span className="platform-arrow" aria-hidden="true">
                  ↗
                </span>
              </motion.a>
              <motion.a
                className="platform-button platform-instagram"
                href={instagramHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir perfil de ${config.artistName} en Instagram`}
                initial={{ opacity: 0, y: 28, scale: 0.94 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={VIEWPORT_CFG}
                transition={{ duration: 0.55, delay: 0.23, ease: EASE_OUT_EXPO }}
              >
                <span className="platform-symbol platform-instagram-symbol" aria-hidden="true">
                  ◎
                </span>
                <span>Instagram</span>
                <span className="platform-arrow" aria-hidden="true">
                  ↗
                </span>
              </motion.a>
            </div>
          </section>

          {/* 02 / VISIÓN — Cinematic sweep from the right */}
          <section className="cinema scene" id="universo">
            <motion.div
              className="cinema-content"
              initial={{ opacity: 0, x: 56, scale: 0.96 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">EL SONIDO, MÁS ALLÁ DEL BEAT</p>
              <h2>
                UNA HISTORIA.
                <br />
                <span>MUCHAS FRECUENCIAS.</span>
              </h2>
              <p className="cinema-note">Música, imágenes y movimiento en un mismo lugar.</p>
            </motion.div>
            <div className="section-index">02 / VISIÓN</div>
          </section>

          {/* MÚSICA — Heading slides from left, now-playing card glides in from right */}
          <section id="musica" className="music-section section">
            <motion.div
              className="section-heading"
              initial={{ opacity: 0, x: -48 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">SELECCIÓN SONORA</p>
              <h2>
                SONANDO <span>AHORA</span>
              </h2>
              <p>
                Si elegís entrar con música, los temas se reproducen automáticamente. La selección
                se administra desde el panel, sin controles para cambiar de canción.
              </p>
            </motion.div>
            <motion.div
              className="now-playing-card"
              aria-live="polite"
              initial={{ opacity: 0, x: 48 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.72, delay: 0.08, ease: EASE_OUT_EXPO }}
            >
              <span className="now-playing-dot" />
              <div>
                <p className="eyebrow">REPRODUCCIÓN ACTUAL</p>
                <strong id="trackStatusTitle">{statusTitle}</strong>
                <p id="trackStatusArtist">{statusArtist}</p>
              </div>
            </motion.div>
          </section>

          {/* 03 / BIO — Number glides from left, biography paragraphs stagger from right */}
          <section id="historia" className="bio-section section">
            <motion.div
              className="bio-number"
              initial={{ opacity: 0, x: -54 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.75, ease: EASE_OUT_EXPO }}
            >
              03
            </motion.div>
            <motion.div
              className="bio-copy"
              initial={{ opacity: 0, x: 44 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.75, delay: 0.08, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">DE CATAMARCA AL SONIDO</p>
              <h2>{config.artistName}</h2>
              <p className="bio-lead">{config.bioLead}</p>
              <p>{config.bioBody1}</p>
              <p>{config.bioBody2}</p>
              <p className="credits-line">{config.bioCredits}</p>
            </motion.div>
          </section>

          {/* GALERÍA — Heading enters from left, cards rise with stagger */}
          <section id="galeria" className="gallery-section section">
            <motion.div
              className="section-heading"
              initial={{ opacity: 0, x: -46 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">IMÁGENES Y MOMENTOS</p>
              <h2>
                OTROS <span>PLANOS</span>
              </h2>
              <p>Imágenes seleccionadas del universo de {config.artistName}.</p>
            </motion.div>
            <div id="galleryItems" className="gallery-track" aria-label="Galería de imágenes">
              {gallery.length === 0 ? (
                <motion.p
                  className="empty-state"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CFG}
                  transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
                >
                  Las imágenes se podrán agregar desde el panel de administración.
                </motion.p>
              ) : (
                gallery.map((item, idx) => (
                  <motion.figure
                    key={item.id}
                    className="gallery-card"
                    initial={{ opacity: 0, y: 34, scale: 0.94 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={VIEWPORT_CFG}
                    transition={{
                      duration: 0.65,
                      delay: Math.min(idx * 0.08, 0.32),
                      ease: EASE_OUT_EXPO,
                    }}
                  >
                    <img
                      src={resolveMediaUrl(item.imageUrl)}
                      alt={item.title || `Imagen de ${config.artistName}`}
                      loading="lazy"
                    />
                    {item.title ? <figcaption>{item.title}</figcaption> : null}
                  </motion.figure>
                ))
              )}
            </div>
          </section>

          {/* COLABORACIONES — Featured Artists Spotlight + Compact Collabs with "Ver más" */}
          <section id="colaboraciones" className="collabs-section section">
            <motion.div
              className="section-heading"
              initial={{ opacity: 0, x: 46 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">ENCUENTROS MUSICALES</p>
              <h2>
                ALGUNAS <span>COLABS</span>
              </h2>
              <p>
                Artistas destacados y colaboraciones seleccionadas. Tocá cualquier artista o tema
                para ir directo a la canción.
              </p>
            </motion.div>

            {collaborations.length === 0 ? (
              <motion.p
                className="empty-state"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_CFG}
                transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
              >
                Las colaboraciones aparecerán aquí cuando se agreguen desde el panel de
                administración.
              </motion.p>
            ) : (
              (() => {
                const featuredArtists = collaborations.filter((c) => c.isFeaturedArtist);
                const otherCollabs = collaborations.filter((c) => !c.isFeaturedArtist);
                const INITIAL_VISIBLE_COLLABS = 3;
                const visibleOtherCollabs = showAllCollabs
                  ? otherCollabs
                  : otherCollabs.slice(0, INITIAL_VISIBLE_COLLABS);
                const hiddenCount = Math.max(0, otherCollabs.length - INITIAL_VISIBLE_COLLABS);

                return (
                  <div id="collaborationItems" className="collabs-showcase">
                    {/* FEATURED ARTISTS SPOTLIGHT */}
                    {featuredArtists.length > 0 && (
                      <div className="featured-artists-block">
                        <p className="collab-sublabel">ARTISTAS DESTACADOS</p>
                        <div className="featured-artists-grid">
                          {featuredArtists.map((item, idx) => {
                            const yt = safeExternalLink(item.youtubeUrl);
                            const sp = safeExternalLink(item.spotifyUrl);
                            const primaryHref = yt || sp;
                            const primaryPlatform = yt ? 'YouTube' : sp ? 'Spotify' : '';
                            const ytId = getYoutubeId(item.youtubeUrl);
                            const artistImg = resolveMediaUrl(
                              item.artistPhotoUrl ||
                                item.imageUrl ||
                                (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '')
                            );
                            const displayName = item.artistName || item.title;
                            const artistNote = item.artistDescription || item.description;
                            const enterX = idx % 3 === 0 ? -36 : idx % 3 === 2 ? 36 : 0;

                            const cardContent = (
                              <>
                                <div className="featured-artist-photo">
                                  {artistImg ? (
                                    <img
                                      src={artistImg}
                                      alt={displayName}
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="featured-artist-fallback" aria-hidden="true">
                                      {displayName.slice(0, 1).toUpperCase()}
                                    </div>
                                  )}
                                  {primaryHref && (
                                    <span
                                      className={`featured-artist-badge ${
                                        yt ? 'badge-youtube' : 'badge-spotify'
                                      }`}
                                      aria-hidden="true"
                                    >
                                      {yt ? '▶' : '≋'}
                                    </span>
                                  )}
                                </div>
                                <div className="featured-artist-info">
                                  <h3>{displayName}</h3>
                                  {item.artistName && item.title && (
                                    <p className="featured-artist-song">{item.title}</p>
                                  )}
                                  {artistNote && (
                                    <p className="featured-artist-desc">{artistNote}</p>
                                  )}
                                  {primaryPlatform && (
                                    <span className="featured-artist-cta">
                                      {yt ? '▶' : '≋'} Escuchar en {primaryPlatform} ↗
                                    </span>
                                  )}
                                </div>
                              </>
                            );

                            return (
                              <motion.article
                                key={item.id}
                                className="featured-artist-card"
                                initial={{ opacity: 0, x: enterX, y: 26 }}
                                whileInView={{ opacity: 1, x: 0, y: 0 }}
                                viewport={VIEWPORT_CFG}
                                transition={{
                                  duration: 0.68,
                                  delay: Math.min((idx % 3) * 0.08, 0.24),
                                  ease: EASE_OUT_EXPO,
                                }}
                              >
                                {primaryHref ? (
                                  <a
                                    className="featured-artist-main"
                                    href={primaryHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Abrir colaboración con ${displayName} en ${primaryPlatform}`}
                                  >
                                    {cardContent}
                                  </a>
                                ) : (
                                  <div className="featured-artist-main">{cardContent}</div>
                                )}

                                {yt && sp && (
                                  <a
                                    className="featured-artist-alt-link"
                                    href={sp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    ≋ También en Spotify ↗
                                  </a>
                                )}
                              </motion.article>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* COMPACT COLLABORATIONS LIST (SHOWS 3 INITIALLY + "VER MÁS") */}
                    {otherCollabs.length > 0 && (
                      <div className="compact-collabs-block">
                        {featuredArtists.length > 0 && (
                          <p className="collab-sublabel">MÁS COLABORACIONES</p>
                        )}
                        <div className="collab-grid collab-grid-compact">
                          {visibleOtherCollabs.map((item, idx) => {
                            const yt = safeExternalLink(item.youtubeUrl);
                            const sp = safeExternalLink(item.spotifyUrl);
                            const ytId = getYoutubeId(item.youtubeUrl);
                            const resolvedImage = resolveMediaUrl(
                              item.imageUrl ||
                                (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '')
                            );
                            const resolvedCollabVideo = resolveMediaUrl(item.videoUrl);
                            const hasMedia = Boolean(resolvedCollabVideo || resolvedImage);
                            const fromLeft = idx % 2 === 0;

                            return (
                              <motion.article
                                key={item.id}
                                className={`collab-card${hasMedia ? '' : ' collab-card-text-only'}`}
                                initial={{ opacity: 0, x: fromLeft ? -34 : 34 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={VIEWPORT_CFG}
                                transition={{
                                  duration: 0.6,
                                  delay: Math.min((idx % 3) * 0.07, 0.21),
                                  ease: EASE_OUT_EXPO,
                                }}
                              >
                                {hasMedia && (
                                  <div className="collab-media-box">
                                    {resolvedCollabVideo ? (
                                      <video
                                        className="collab-media"
                                        src={resolvedCollabVideo}
                                        muted
                                        autoPlay
                                        loop
                                        playsInline
                                        preload="metadata"
                                      />
                                    ) : (
                                      <img
                                        className="collab-media"
                                        src={resolvedImage}
                                        alt={item.title}
                                        loading="lazy"
                                      />
                                    )}
                                  </div>
                                )}
                                <div className="collab-body">
                                  <h3>{item.title}</h3>
                                  {item.description ? (
                                    <p className="collab-description">{item.description}</p>
                                  ) : null}
                                  {(yt || sp) && (
                                    <div className="collab-links">
                                      {yt && (
                                        <a
                                          className="platform-button platform-youtube collab-platform-button"
                                          href={yt}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          ▶ YouTube ↗
                                        </a>
                                      )}
                                      {sp && (
                                        <a
                                          className="platform-button platform-spotify collab-platform-button"
                                          href={sp}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Spotify ↗
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </motion.article>
                            );
                          })}
                        </div>

                        {hiddenCount > 0 && (
                          <div className="collab-toggle-wrap">
                            <button
                              type="button"
                              className="smokk-btn button-outline collab-toggle-btn"
                              onClick={() => setShowAllCollabs((prev) => !prev)}
                            >
                              {showAllCollabs
                                ? 'VER MENOS COLABORACIONES ↑'
                                : `VER MÁS COLABORACIONES (+${hiddenCount}) ↓`}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </section>

          {/* ÚLTIMO ESTRENO — Heading from left, YouTube player scales cleanly */}
          <section id="lanzamiento" className="release-section section">
            <motion.div
              className="section-heading"
              initial={{ opacity: 0, x: -46 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">VIDEO DESTACADO</p>
              <h2>
                ÚLTIMO <span>ESTRENO</span>
              </h2>
              <p id="releaseDescription">{config.featuredVideoDescription}</p>
            </motion.div>
            <motion.div
              className="youtube-frame"
              id="featuredVideoWrap"
              initial={{ opacity: 0, y: 36, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.75, ease: EASE_OUT_EXPO }}
            >
              <iframe
                id="featuredVideo"
                src={`https://www.youtube-nocookie.com/embed/${featuredYoutubeId}`}
                title={`Video de ${config.artistName}`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </motion.div>
            <p className="release-caption" id="releaseTitle">
              {config.featuredVideoTitle}
            </p>
          </section>

          {/* CANAL CTA — Text from left, red button from right */}
          <section className="always-video section">
            <motion.div
              initial={{ opacity: 0, x: -44 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
            >
              <p className="eyebrow">EN EL CANAL</p>
              <h2>
                SEGUÍ <span>EXPLORANDO</span>
              </h2>
              <p>Un espacio permanente para ver videos del artista.</p>
            </motion.div>
            <motion.a
              className="smokk-btn button-red"
              id="channelButton"
              href={youtubeHref}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, x: 44 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={VIEWPORT_CFG}
              transition={{ duration: 0.7, delay: 0.08, ease: EASE_OUT_EXPO }}
            >
              VER CANAL DE YOUTUBE ↗
            </motion.a>
          </section>
        </main>

        <footer className="footer">
          <a className="wordmark" href="#inicio">
            {config.artistName}
          </a>
          <div id="contactLine">{config.contactLine}</div>
          <div className="footer-social">
            <a href={instagramHref} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
            <a href={spotifyHref} target="_blank" rel="noopener noreferrer">
              Spotify
            </a>
            <a href={youtubeHref} target="_blank" rel="noopener noreferrer">
              YouTube
            </a>
          </div>
          <small>
            <span>
              © {currentYear} {config.artistName} — Todos los derechos reservados.
            </span>
            <a
              href="/admin"
              className="admin-subtle-link"
              onClick={(e) => {
                e.preventDefault();
                onOpenAdmin();
              }}
            >
              Admin
            </a>
          </small>
        </footer>

        <div
          className="now-playing-ticker"
          id="nowPlayingTicker"
          hidden={!showTicker}
          aria-live="polite"
          aria-label="Tema reproduciéndose"
        >
          <span className="ticker-label">SONANDO</span>
          <div className="ticker-window">
            <div className="ticker-track">
              <span id="nowPlayingText">{tickerText}</span>
              <span id="nowPlayingTextClone" aria-hidden="true">
                {tickerText}
              </span>
            </div>
          </div>
          <span className="ticker-equalizer" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>

        <div className="bottom-bar" id="bottomBar">
          <span className="bottom-mark">{config.artistName.slice(0, 1).toUpperCase() || 'S'}</span>
          <div className="bottom-copy">
            <strong>{config.artistName}</strong>
            <small id="bottomStatus">{bottomStatus}</small>
          </div>
          {installPrompt && (
            <button
              id="installButton"
              type="button"
              onClick={handleInstallClick}
              className="install-button"
            >
              INSTALAR
            </button>
          )}
          <a
            id="mobileSocial"
            href={instagramHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            SEGUIR ↗
          </a>
        </div>
      </div>
    </MotionConfig>
  );
};
