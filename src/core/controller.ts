import type { Engine } from './engines/engine.js';
import { selectEngine, type EngineOptions } from './engines/select-engine.js';
import { createError, type PlayerError } from './errors.js';
import { Store } from './store.js';
import {
  createInitialState,
  type Capabilities,
  type PlayerState,
  type TimeRange,
} from './types.js';

// Vendor-prefixed APIs that Safari/iOS still need.
interface WebkitVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitSupportsFullscreen?: boolean;
  webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture' | 'fullscreen') => void;
  webkitPresentationMode?: string;
}
interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => void;
}
interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}

export interface ControllerOptions extends EngineOptions {
  autoplay?: boolean;
  /** Remember volume/mute between visits (default true). */
  persistVolume?: boolean;
  storageKey?: string;
  /** Overrides capability detection (mainly for tests). */
  capabilities?: Partial<Capabilities>;
  /** Overrides engine selection (mainly for tests). */
  selectEngine?: typeof selectEngine;
}

/** Events the controller dispatches; <movie-player> re-dispatches them with an `mp-` prefix. */
export const CONTROLLER_EVENTS = [
  'loadedmetadata',
  'play',
  'pause',
  'playing',
  'ended',
  'timeupdate',
  'seeking',
  'seeked',
  'waiting',
  'volumechange',
  'ratechange',
  'fullscreenchange',
  'pipchange',
  'statechange',
  'error',
  'autoplay-muted',
] as const;
export type ControllerEventType = (typeof CONTROLLER_EVENTS)[number];

const MEDIA_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'durationchange',
  'canplay',
  'play',
  'playing',
  'pause',
  'waiting',
  'ended',
  'timeupdate',
  'seeking',
  'seeked',
  'progress',
  'volumechange',
  'ratechange',
  'enterpictureinpicture',
  'leavepictureinpicture',
  'webkitpresentationmodechanged',
  'webkitbeginfullscreen',
  'webkitendfullscreen',
] as const;

/**
 * The player's brain. Actions (play, seek, …) call the <video> element;
 * state only changes in response to the element's own events, so the UI can
 * never drift from what the video is actually doing.
 */
export class PlayerController extends EventTarget {
  readonly store: Store<PlayerState>;
  private engine: Engine | null = null;
  private engineCleanup: (() => void)[] = [];
  private loadToken = 0;
  private rafId = 0;
  private connected = false;
  private engineLive = false;
  private volumeRestored = false;
  private readonly video: WebkitVideo;
  private readonly host: WebkitElement;

  constructor(
    host: HTMLElement,
    video: HTMLVideoElement,
    private options: ControllerOptions = {},
  ) {
    super();
    this.host = host;
    this.video = video;
    this.store = new Store(
      createInitialState({ capabilities: { ...detectCapabilities(), ...options.capabilities } }),
    );
    this.syncVolume();
    this.store.subscribe(
      (s) => s.status,
      (status, previous) => this.emit('statechange', { status, previous }),
    );
  }

  get state(): PlayerState {
    return this.store.get();
  }

  get engineName(): Engine['name'] | null {
    return this.engine?.name ?? null;
  }

  /** Starts listening to the video element and document. Call when the host connects. */
  connect(): void {
    if (this.connected) return;
    this.connected = true;
    if (!this.volumeRestored) {
      // Deferred to the first connect so options (e.g. persistVolume) are final.
      this.volumeRestored = true;
      this.restoreVolume();
      this.syncVolume();
    }
    for (const type of MEDIA_EVENTS) this.video.addEventListener(type, this.onMediaEvent);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Stops listening and tears down the engine. Call when the host disconnects. */
  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    for (const type of MEDIA_EVENTS) this.video.removeEventListener(type, this.onMediaEvent);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopTimeLoop();
    this.loadToken++;
    this.destroyEngine();
  }

  updateOptions(options: Partial<ControllerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  async load(src: string): Promise<void> {
    const token = ++this.loadToken;
    this.destroyEngine();
    this.stopTimeLoop();
    this.engineLive = false;
    this.store.set({
      src,
      status: src ? 'loading' : 'idle',
      error: null,
      currentTime: 0,
      duration: NaN,
      live: false,
      buffered: [],
    });
    if (!src) return;

    let engine: Engine | null;
    try {
      const select = this.options.selectEngine ?? selectEngine;
      engine = await select(src, this.video, this.options);
    } catch (cause) {
      if (token === this.loadToken) {
        this.fail(createError('NETWORK', 'The video player failed to load', { cause }));
      }
      return;
    }

    if (token !== this.loadToken) {
      engine?.destroy(); // a newer load started while we were waiting
      return;
    }
    if (!engine) {
      this.fail(createError('UNSUPPORTED', 'This video cannot be played in this browser'));
      return;
    }

    this.engine = engine;
    this.engineCleanup.push(engine.onError((error) => this.onEngineError(error)));
    if (engine.onLiveChange) {
      this.engineCleanup.push(
        engine.onLiveChange((live) => {
          this.engineLive = live;
          this.store.set({ live: live || this.video.duration === Infinity });
        }),
      );
    }
    engine.attach(this.video);
    engine.load(src);
    if (this.options.autoplay) void this.play({ autoplay: true });
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Starts playback. With `autoplay`, a browser autoplay block is retried
   * muted (and `autoplay-muted` is dispatched so the page can offer unmute).
   */
  async play({ autoplay = false } = {}): Promise<void> {
    try {
      await this.video.play();
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'AbortError') return; // interrupted by pause() or a new load
      if (name === 'NotAllowedError' && autoplay && !this.video.muted) {
        this.video.muted = true;
        try {
          await this.video.play();
          this.emit('autoplay-muted');
        } catch {
          this.video.muted = false; // stay paused; the big play button remains
        }
      }
    }
  }

  pause(): void {
    this.video.pause();
  }

  togglePlay(): void {
    if (this.video.paused || this.video.ended) void this.play();
    else this.pause();
  }

  /** Seeks to `time` seconds, clamped to the video's length. No-op for live streams. */
  seek(time: number): void {
    const { duration, live } = this.state;
    if (live || !Number.isFinite(duration)) return;
    this.video.currentTime = clamp(time, 0, duration);
  }

  seekBy(delta: number): void {
    this.seek(this.video.currentTime + delta);
  }

  setVolume(volume: number): void {
    this.video.volume = clamp(volume, 0, 1);
    if (this.video.volume > 0 && this.video.muted) this.video.muted = false;
    this.persistVolume();
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted;
    // Unmuting at zero volume would be silent; restore an audible level.
    if (!muted && this.video.volume === 0) this.video.volume = 0.5;
    this.persistVolume();
  }

  toggleMute(): void {
    this.setMuted(!this.video.muted);
  }

  setPlaybackRate(rate: number): void {
    this.video.playbackRate = clamp(rate, 0.0625, 16);
  }

  async toggleFullscreen(): Promise<void> {
    const doc = document as WebkitDocument;
    try {
      if (this.state.fullscreen) {
        if (doc.exitFullscreen && doc.fullscreenElement) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        return;
      }
      // Fullscreen the host (not the video) so the custom controls stay visible.
      if (this.host.requestFullscreen) await this.host.requestFullscreen();
      else if (this.host.webkitRequestFullscreen) this.host.webkitRequestFullscreen();
      // iPhone: only the video element can go fullscreen (with native controls).
      else if (this.video.webkitEnterFullscreen) this.video.webkitEnterFullscreen();
    } catch {
      // Rejected (e.g. not triggered by a user gesture); nothing to do.
    }
  }

  async togglePip(): Promise<void> {
    try {
      if (this.state.pip) {
        if (document.exitPictureInPicture && document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          this.video.webkitSetPresentationMode?.('inline');
        }
        return;
      }
      if (this.video.requestPictureInPicture) await this.video.requestPictureInPicture();
      else this.video.webkitSetPresentationMode?.('picture-in-picture');
    } catch {
      // Rejected (e.g. disablePictureInPicture or no user gesture).
    }
  }

  setControlsVisible(visible: boolean): void {
    this.store.set({ controlsVisible: visible });
  }

  /** Retries loading the current source after a fatal error. */
  retry(): void {
    const { src, currentTime } = this.state;
    const resumeAt = currentTime;
    void this.load(src).then(() => {
      if (resumeAt > 0) {
        this.video.addEventListener('loadedmetadata', () => this.seek(resumeAt), { once: true });
      }
    });
  }

  // ─── Media events → state ────────────────────────────────────────────────

  private onMediaEvent = (event: Event) => {
    const v = this.video;
    const state = this.state;
    switch (event.type) {
      case 'loadstart':
        if (state.src && state.status !== 'error') this.store.set({ status: 'loading' });
        break;
      case 'loadedmetadata':
      case 'durationchange':
        this.store.set({
          duration: v.duration,
          live: this.engineLive || v.duration === Infinity,
          ...(state.status === 'loading' ? { status: v.paused ? 'ready' : 'playing' } : {}),
        });
        break;
      case 'canplay':
        if (state.status === 'waiting' || state.status === 'loading') {
          this.store.set({
            status: v.paused ? (v.played?.length ? 'paused' : 'ready') : 'playing',
          });
        }
        break;
      case 'playing':
        this.store.set({ status: 'playing' });
        this.startTimeLoop();
        break;
      case 'pause':
        if (!v.ended) this.store.set({ status: 'paused', currentTime: v.currentTime });
        this.stopTimeLoop();
        break;
      case 'waiting':
        this.store.set({ status: 'waiting' });
        break;
      case 'ended':
        this.store.set({ status: 'ended', currentTime: v.currentTime });
        this.stopTimeLoop();
        break;
      case 'timeupdate':
      case 'seeking':
      case 'seeked':
        this.store.set({ currentTime: v.currentTime });
        break;
      case 'progress':
        this.store.set({ buffered: toRanges(v.buffered) });
        break;
      case 'volumechange':
        this.syncVolume();
        break;
      case 'ratechange':
        this.store.set({ playbackRate: v.playbackRate });
        break;
      case 'enterpictureinpicture':
        this.setPip(true);
        break;
      case 'leavepictureinpicture':
        this.setPip(false);
        break;
      case 'webkitpresentationmodechanged':
        this.setPip(v.webkitPresentationMode === 'picture-in-picture');
        break;
      case 'webkitbeginfullscreen':
      case 'webkitendfullscreen':
        this.setFullscreen(event.type === 'webkitbeginfullscreen');
        break;
    }
    if (CONTROLLER_EVENTS.includes(event.type as ControllerEventType)) {
      this.emit(event.type as ControllerEventType);
    }
  };

  private onFullscreenChange = () => {
    const doc = document as WebkitDocument;
    const element = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    this.setFullscreen(element === this.host);
  };

  private onVisibilityChange = () => {
    if (document.hidden) this.stopTimeLoop();
    else if (this.state.status === 'playing') this.startTimeLoop();
  };

  private setFullscreen(fullscreen: boolean) {
    if (fullscreen === this.state.fullscreen) return;
    this.store.set({ fullscreen });
    this.emit('fullscreenchange');
  }

  private setPip(pip: boolean) {
    if (pip === this.state.pip) return;
    this.store.set({ pip });
    this.emit('pipchange');
  }

  private syncVolume() {
    this.store.set({ volume: this.video.volume, muted: this.video.muted });
  }

  private onEngineError(error: PlayerError) {
    if (error.fatal) this.fail(error);
    else this.emit('error', error);
  }

  private fail(error: PlayerError) {
    this.stopTimeLoop();
    this.store.set({ status: 'error', error });
    this.emit('error', error);
  }

  // ─── Smooth time updates ─────────────────────────────────────────────────
  // `timeupdate` fires only ~4×/s; while playing, also sample every frame.

  private startTimeLoop() {
    if (this.rafId || typeof requestAnimationFrame !== 'function') return;
    const tick = () => {
      this.store.set({ currentTime: this.video.currentTime });
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopTimeLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private destroyEngine() {
    for (const cleanup of this.engineCleanup) cleanup();
    this.engineCleanup = [];
    this.engine?.destroy();
    this.engine = null;
  }

  private emit(type: ControllerEventType, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail: detail ?? this.state }));
  }

  private get storageKey() {
    return this.options.storageKey ?? 'movie-player:volume';
  }

  private persistVolume() {
    if (this.options.persistVolume === false) return;
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({ volume: this.video.volume, muted: this.video.muted }),
      );
    } catch {
      // Storage unavailable (private mode, blocked); volume just won't persist.
    }
  }

  private restoreVolume() {
    if (this.options.persistVolume === false) return;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null');
      if (saved && typeof saved.volume === 'number') {
        this.video.volume = clamp(saved.volume, 0, 1);
        this.video.muted = Boolean(saved.muted);
      }
    } catch {
      // Ignore unreadable storage.
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRanges(ranges: TimeRanges): TimeRange[] {
  const out: TimeRange[] = [];
  for (let i = 0; i < ranges.length; i++) out.push([ranges.start(i), ranges.end(i)]);
  return out;
}

function detectCapabilities(): Capabilities {
  const probe = document.createElement('video') as WebkitVideo;
  const doc = document as WebkitDocument & { webkitFullscreenEnabled?: boolean };
  // iOS ignores volume changes from JavaScript; detect by writing and reading back.
  let volumeControl: boolean;
  try {
    probe.volume = 0.5;
    volumeControl = probe.volume === 0.5;
  } catch {
    volumeControl = false;
  }
  return {
    fullscreen: Boolean(
      doc.fullscreenEnabled || doc.webkitFullscreenEnabled || probe.webkitEnterFullscreen,
    ),
    pip: Boolean(
      (document.pictureInPictureEnabled && !probe.disablePictureInPicture) ||
      typeof probe.webkitSetPresentationMode === 'function',
    ),
    volumeControl,
  };
}
