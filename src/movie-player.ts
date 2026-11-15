import { LitElement, css, html, type PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { CONTROLLER_EVENTS, PlayerController } from './core/controller.js';
import type { PlayerState } from './core/types.js';

/**
 * <movie-player>: embeddable HLS movie player.
 *
 * Attributes: src, poster, type, autoplay, muted, loop, preload, crossorigin,
 * prefer-native, no-persist-volume.
 * Events: mp-play, mp-pause, mp-timeupdate, mp-error, … (see CONTROLLER_EVENTS),
 * dispatched with `bubbles` and `composed` so they cross shadow DOM.
 */
@customElement('movie-player')
export class MoviePlayer extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
      background: var(--mp-background, #000);
      aspect-ratio: var(--mp-aspect-ratio, 16 / 9);
      overflow: hidden;
    }
    video {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: var(--mp-object-fit, contain);
    }
  `;

  @property() src = '';
  @property() poster = '';
  /** MIME type hint for URLs without a .m3u8 extension. */
  @property() type = '';
  @property({ type: Boolean }) autoplay = false;
  @property({ type: Boolean }) loop = false;
  @property() preload: 'none' | 'metadata' | 'auto' = 'metadata';
  @property() crossorigin: 'anonymous' | 'use-credentials' | null = null;
  /** Use Safari's native HLS even where hls.js works (disables manual quality selection). */
  @property({ type: Boolean, attribute: 'prefer-native' }) preferNative = false;
  @property({ type: Boolean, attribute: 'no-persist-volume' }) noPersistVolume = false;

  private readonly video: HTMLVideoElement;
  /** The player controller; custom controls use it to read state and trigger actions. */
  readonly controller: PlayerController;

  constructor() {
    super();
    this.video = document.createElement('video');
    this.video.setAttribute('part', 'video');
    this.video.playsInline = true;
    this.video.controls = true; // temporary until custom controls land
    this.controller = new PlayerController(this, this.video);
    for (const type of CONTROLLER_EVENTS) {
      this.controller.addEventListener(type, (event) => {
        this.dispatchEvent(
          new CustomEvent(`mp-${type}`, {
            detail: (event as CustomEvent).detail,
            bubbles: true,
            composed: true,
          }),
        );
      });
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  connectedCallback() {
    super.connectedCallback();
    this.controller.connect();
    // Reconnecting after a DOM move: reload the current source.
    if (this.src && this.hasUpdated) void this.controller.load(this.src);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller.disconnect();
  }

  protected willUpdate(changed: PropertyValues<this>) {
    const v = this.video;
    if (changed.has('poster')) {
      if (this.poster) v.setAttribute('poster', this.poster);
      else v.removeAttribute('poster');
    }
    if (changed.has('loop')) v.loop = this.loop;
    if (changed.has('preload')) v.preload = this.preload;
    if (changed.has('crossorigin')) {
      if (this.crossorigin) v.setAttribute('crossorigin', this.crossorigin);
      else v.removeAttribute('crossorigin');
    }
    if (
      changed.has('autoplay') ||
      changed.has('type') ||
      changed.has('preferNative') ||
      changed.has('noPersistVolume')
    ) {
      this.controller.updateOptions({
        autoplay: this.autoplay,
        type: this.type || undefined,
        preferNative: this.preferNative,
        persistVolume: !this.noPersistVolume,
      });
    }
  }

  protected updated(changed: PropertyValues<this>) {
    if (changed.has('src') && this.isConnected) void this.controller.load(this.src);
  }

  render() {
    return html`${this.video}`;
  }

  // ─── Public API (mirrors HTMLMediaElement where it makes sense) ──────────

  /** Muted state. The `muted` attribute sets the initial value and overrides a remembered one. */
  @property({ type: Boolean })
  get muted(): boolean {
    return this.video.muted;
  }
  set muted(value: boolean) {
    const old = this.video.muted;
    this.video.muted = value;
    this.requestUpdate('muted', old);
  }

  get volume(): number {
    return this.video.volume;
  }
  set volume(value: number) {
    this.controller.setVolume(value);
  }

  get currentTime(): number {
    return this.video.currentTime;
  }
  set currentTime(value: number) {
    this.controller.seek(value);
  }

  get playbackRate(): number {
    return this.video.playbackRate;
  }
  set playbackRate(value: number) {
    this.controller.setPlaybackRate(value);
  }

  get duration(): number {
    return this.controller.state.duration;
  }
  get paused(): boolean {
    return this.video.paused;
  }
  get ended(): boolean {
    return this.video.ended;
  }

  /** A read-only snapshot of the full player state. */
  get state(): PlayerState {
    return this.controller.state;
  }

  play(): Promise<void> {
    return this.controller.play();
  }
  pause(): void {
    this.controller.pause();
  }
  toggleFullscreen(): Promise<void> {
    return this.controller.toggleFullscreen();
  }
  togglePictureInPicture(): Promise<void> {
    return this.controller.togglePip();
  }

  /**
   * Subscribe to a slice of state; `callback` fires only when it changes.
   * Returns an unsubscribe function.
   *
   *     player.subscribe((s) => s.status, (status) => console.log(status));
   */
  subscribe<S>(
    selector: (state: PlayerState) => S,
    callback: (slice: S, prev: S) => void,
  ): () => void {
    return this.controller.store.subscribe(selector, callback);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'movie-player': MoviePlayer;
  }
}
