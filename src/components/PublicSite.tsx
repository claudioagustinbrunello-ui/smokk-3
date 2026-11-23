import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBackgroundVideoBlobUrl,
  fetchPublicCollaborations,
  fetchPublicGallery,
  fetchPublicTracks,
  fetchSiteConfig,
  fetchTrackAudioUrl,
} from '../services/cms';
import {
  Collaboration,
  DEFAULT_SITE_CONFIG,
  GalleryItem,
  SiteConfig,
  Track,
} from '../types';
import { getYoutubeId, safeExternalLink } from '../utils/media';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PublicSiteProps {
  onOpenAdmin: () => void;
}

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
  const [uploadedBgVideoUrl, setUploadedBgVideoUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resolvedAudioUrlsRef = useRef<Map<string, string>>(new Map());
  const tracksRef = useRef<Track[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const musicEnabledRef = useRef<boolean>(false);

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

  // Cleanup blob object URLs on unmount
  useEffect(() => {
    const cache = resolvedAudioUrlsRef.current;
    return () => {
      cache.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      cache.clear();
    };
  }, []);

  // Load site data, uploaded background video, and preload the first audio track
  useEffect(() => {
    let active = true;
    let bgBlobUrl: string | null = null;

    async function loadAll() {
      const [cfgRes, tracksRes, galleryRes, collabsRes, bgVideoRes] = await Promise.allSettled([
        fetchSiteConfig(),
        fetchPublicTracks(),
        fetchPublicGallery(),
        fetchPublicCollaborations(),
        fetchBackgroundVideoBlobUrl(false),
      ]);

      if (!active) return;

      if (bgVideoRes.status === 'fulfilled' && bgVideoRes.value) {
        bgBlobUrl = bgVideoRes.value;
        setUploadedBgVideoUrl(bgVideoRes.value);
      }

      if (cfgRes.status === 'fulfilled') {
        setConfig(cfgRes.value);
        setPortraitFailed(false);
        setBgImgFailed(false);
      }

      if (galleryRes.status === 'fulfilled') {
        setGallery(galleryRes.value);
      }

      if (collabsRes.status === 'fulfilled') {
        setCollaborations(collabsRes.value);
      }

      if (tracksRes.status === 'fulfilled') {
        const loadedTracks = tracksRes.value;
        setTracks(loadedTracks);
        tracksRef.current = loadedTracks;

        if (!loadedTracks.length) {
          setStatusTitle('Todavía no hay canciones cargadas');
          setStatusArtist(cfgRes.status === 'fulfilled' ? cfgRes.value.artistName : 'SMOKK');
        } else {
          // Preload first track so audio.play() can run synchronously inside user click gesture
          try {
            const firstTrack = loadedTracks[0];
            const firstUrl = await fetchTrackAudioUrl(firstTrack, false);
            if (!active) return;
            resolvedAudioUrlsRef.current.set(firstTrack.id, firstUrl);
            if (audioRef.current) {
              audioRef.current.src = firstUrl;
              audioRef.current.load();
            }
          } catch (err) {
            console.error('Error preloading first track:', err);
          }
        }
      }

      if (active) {
        setAudioReady(true);
      }
    }

    loadAll();

    return () => {
      active = false;
      if (bgBlobUrl && bgBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(bgBlobUrl);
      }
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

  // Scroll reveal observer (mirrors original app.js)
  useEffect(() => {
    if (!entered) return;
    const targets = document.querySelectorAll(
      '#site main > section:not(.hero):not(.platform-access), .section-heading, .platform-access-heading, .platform-buttons, .now-playing-card, .bio-copy > *, .gallery-card, .collab-card, .youtube-frame, .always-video > *'
    );
    targets.forEach((element, index) => {
      if (element.classList.contains('scroll-reveal')) return;
      element.classList.add('scroll-reveal');
      if (index % 4 === 1) element.classList.add('scroll-reveal-left');
      else if (index % 4 === 3) element.classList.add('scroll-reveal-scale');
    });

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      document.querySelectorAll('.scroll-reveal').forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -35px 0px' }
    );

    document.querySelectorAll('.scroll-reveal').forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [entered, gallery.length, collaborations.length]);

  const playTrackByIndex = useCallback(async (index: number) => {
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

    try {
      let url = resolvedAudioUrlsRef.current.get(track.id);
      if (!url) {
        url = await fetchTrackAudioUrl(track, false);
        resolvedAudioUrlsRef.current.set(track.id, url);
      }
      if (audio.src !== url) {
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
    } catch {
      setStatusTitle('No se pudo reproducir la canción');
      setStatusArtist('Revisá el archivo cargado en el panel de administración');
      setIsPlaying(false);
    }
  }, [config.artistName]);

  const handleEnter = (withMusic: boolean) => {
    setMusicEnabled(withMusic);
    musicEnabledRef.current = withMusic;
    setIntroLeaving(true);

    // Start audio synchronously inside the click gesture when ready
    if (withMusic && tracksRef.current.length > 0) {
      const firstTrack = tracksRef.current[0];
      const preloadedUrl = resolvedAudioUrlsRef.current.get(firstTrack.id);
      const audio = audioRef.current;
      if (audio && preloadedUrl) {
        currentIndexRef.current = 0;
        setCurrentTrackIndex(0);
        setStatusTitle(firstTrack.title);
        setStatusArtist(firstTrack.artist);
        setBottomStatus(`${firstTrack.title} — ${firstTrack.artist}`);
        if (audio.src !== preloadedUrl) {
          audio.src = preloadedUrl;
        }
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            setStatusTitle('No se pudo iniciar el audio');
            setStatusArtist('Revisá el archivo de la canción');
            setIsPlaying(false);
          });
        }
      } else {
        void playTrackByIndex(0);
      }
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

  return (
    <>
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
          {uploadedBgVideoUrl || config.backgroundVideoUrl ? (
            <video
              id="backgroundVideo"
              src={uploadedBgVideoUrl || config.backgroundVideoUrl}
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
          <section id="inicio" className="hero scene">
            <div className="hero-copy">
              <p className="eyebrow reveal">{config.heroEyebrow}</p>
              <h1 className="hero-title reveal">{config.artistName}</h1>
              <a className="text-link reveal" href="#musica">
                DESCUBRIR LA MÚSICA <span>↓</span>
              </a>
            </div>
            <div className="hero-art" aria-hidden="true">
              {config.backgroundImage && !bgImgFailed ? (
                <img
                  className="hero-art-background"
                  src={config.backgroundImage}
                  alt=""
                  onError={() => setBgImgFailed(true)}
                />
              ) : null}
              {!portraitFailed && (
                <img
                  id="artistPortrait"
                  className="hero-art-person"
                  src={
                    !config.portraitImage ||
                    config.portraitImage === '/material/imagenes/personaje.png'
                      ? `${import.meta.env.BASE_URL}material/imagenes/personaje.png`
                      : config.portraitImage
                  }
                  alt=""
                  onError={() => setPortraitFailed(true)}
                />
              )}
            </div>
            <div className="hero-bottom">
              <span>01 / UNIVERSO</span>
              <span>DESLIZÁ PARA EXPLORAR</span>
            </div>
          </section>

          <section className="platform-access section" aria-label="Accesos oficiales a las plataformas">
            <div className="platform-access-heading">
              <p className="eyebrow">CONECTÁ CON {config.artistName}</p>
              <h2>
                ENCONTRALO EN <span>PLATAFORMAS</span>
              </h2>
              <p>Accedé directamente a su música y contenido.</p>
            </div>
            <div className="platform-buttons" id="platformButtons">
              <a
                className="platform-button platform-youtube"
                href={youtubeHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir canal de ${config.artistName} en YouTube`}
              >
                <span className="platform-symbol" aria-hidden="true">
                  ▶
                </span>
                <span>YouTube</span>
                <span className="platform-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
              <a
                className="platform-button platform-spotify"
                href={spotifyHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir perfil de ${config.artistName} en Spotify`}
              >
                <span className="platform-symbol platform-spotify-symbol" aria-hidden="true">
                  ≋
                </span>
                <span>Spotify</span>
                <span className="platform-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
              <a
                className="platform-button platform-instagram"
                href={instagramHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir perfil de ${config.artistName} en Instagram`}
              >
                <span className="platform-symbol platform-instagram-symbol" aria-hidden="true">
                  ◎
                </span>
                <span>Instagram</span>
                <span className="platform-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            </div>
          </section>

          <section className="cinema scene" id="universo">
            <div className="cinema-content">
              <p className="eyebrow">EL SONIDO, MÁS ALLÁ DEL BEAT</p>
              <h2>
                UNA HISTORIA.
                <br />
                <span>MUCHAS FRECUENCIAS.</span>
              </h2>
              <p className="cinema-note">Música, imágenes y movimiento en un mismo lugar.</p>
            </div>
            <div className="section-index">02 / VISIÓN</div>
          </section>

          <section id="musica" className="music-section section">
            <div className="section-heading">
              <p className="eyebrow">SELECCIÓN SONORA</p>
              <h2>
                SONANDO <span>AHORA</span>
              </h2>
              <p>
                Si elegís entrar con música, los temas se reproducen automáticamente. La selección
                se administra desde el panel, sin controles para cambiar de canción.
              </p>
            </div>
            <div className="now-playing-card" aria-live="polite">
              <span className="now-playing-dot" />
              <div>
                <p className="eyebrow">REPRODUCCIÓN ACTUAL</p>
                <strong id="trackStatusTitle">{statusTitle}</strong>
                <p id="trackStatusArtist">{statusArtist}</p>
              </div>
            </div>
          </section>

          <section id="historia" className="bio-section section">
            <div className="bio-number">03</div>
            <div className="bio-copy">
              <p className="eyebrow">DE CATAMARCA AL SONIDO</p>
              <h2>{config.artistName}</h2>
              <p className="bio-lead">{config.bioLead}</p>
              <p>{config.bioBody1}</p>
              <p>{config.bioBody2}</p>
              <p className="credits-line">{config.bioCredits}</p>
            </div>
          </section>

          <section id="galeria" className="gallery-section section">
            <div className="section-heading">
              <p className="eyebrow">IMÁGENES Y MOMENTOS</p>
              <h2>
                OTROS <span>PLANOS</span>
              </h2>
              <p>Imágenes seleccionadas del universo de {config.artistName}.</p>
            </div>
            <div id="galleryItems" className="gallery-track" aria-label="Galería de imágenes">
              {gallery.length === 0 ? (
                <p className="empty-state">
                  Las imágenes se podrán agregar desde el panel de administración.
                </p>
              ) : (
                gallery.map((item) => (
                  <figure key={item.id} className="gallery-card">
                    <img
                      src={item.imageUrl}
                      alt={item.title || `Imagen de ${config.artistName}`}
                      loading="lazy"
                    />
                    {item.title ? <figcaption>{item.title}</figcaption> : null}
                  </figure>
                ))
              )}
            </div>
          </section>

          <section id="colaboraciones" className="collabs-section section">
            <div className="section-heading">
              <p className="eyebrow">ENCUENTROS MUSICALES</p>
              <h2>
                ALGUNAS <span>COLABS</span>
              </h2>
              <p>
                Colaboraciones seleccionadas. Cada publicación puede incluir imagen o video y
                enlaces disponibles.
              </p>
            </div>
            <div id="collaborationItems" className="collab-grid">
              {collaborations.length === 0 ? (
                <p className="empty-state">
                  Las colaboraciones aparecerán aquí cuando se agreguen desde el panel de
                  administración.
                </p>
              ) : (
                collaborations.map((item) => {
                  const yt = safeExternalLink(item.youtubeUrl);
                  const sp = safeExternalLink(item.spotifyUrl);
                  const ytId = getYoutubeId(item.youtubeUrl);
                  const resolvedImage =
                    item.imageUrl || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : '');
                  const hasMedia = Boolean(item.videoUrl || resolvedImage);
                  return (
                    <article
                      key={item.id}
                      className={`collab-card${hasMedia ? '' : ' collab-card-text-only'}`}
                    >
                      {hasMedia && (
                        <div className="collab-media-box">
                          {item.videoUrl ? (
                            <video
                              className="collab-media"
                              src={item.videoUrl}
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
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section id="lanzamiento" className="release-section section">
            <div className="section-heading">
              <p className="eyebrow">VIDEO DESTACADO</p>
              <h2>
                ÚLTIMO <span>ESTRENO</span>
              </h2>
              <p id="releaseDescription">{config.featuredVideoDescription}</p>
            </div>
            <div className="youtube-frame" id="featuredVideoWrap">
              <iframe
                id="featuredVideo"
                src={`https://www.youtube-nocookie.com/embed/${featuredYoutubeId}`}
                title={`Video de ${config.artistName}`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <p className="release-caption" id="releaseTitle">
              {config.featuredVideoTitle}
            </p>
          </section>

          <section className="always-video section">
            <div>
              <p className="eyebrow">EN EL CANAL</p>
              <h2>
                SEGUÍ <span>EXPLORANDO</span>
              </h2>
              <p>Un espacio permanente para ver videos del artista.</p>
            </div>
            <a
              className="smokk-btn button-red"
              id="channelButton"
              href={youtubeHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              VER CANAL DE YOUTUBE ↗
            </a>
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
    </>
  );
};
