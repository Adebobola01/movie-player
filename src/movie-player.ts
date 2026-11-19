import { ContextProvider } from '@lit/context';
import { LitElement, css, html, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { CONTROLLER_EVENTS, PlayerController } from './core/controller.js';
import type { PlayerState } from './core/types.js';
import { AutoHide } from './ui/auto-hide.js';
import { playerContext } from './ui/context.js';
import './ui/controls/index.js';
import { DEFAULT_SHORTCUTS, handleShortcut, type ShortcutMap } from './ui/keyboard.js';

const INDICATOR_MS = 700;

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
      color: var(--mp-control-color, #fff);
      font-family: var(--mp-font, system-ui, sans-serif);
      -webkit-tap-highlight-color: transparent;
      outline: none;
    }
    :host(:focus-visible) {
      outline: 2px solid var(--mp-focus-ring, var(--mp-accent, #4f8cff));
      outline-offset: 2px;
    }
    :host(:fullscreen) {
      aspect-ratio: auto;
    }
    :host([data-idle]) {
      cursor: none;
    }
    .click-area {
      position: absolute;
      inset: 0;
    }
    .indicator {
      position: absolute;
      top: 20%;
      left: 50%;
      translate: -50% 0;
      padding: 8px 16px;
      border-radius: var(--mp-control-radius, 8px);
      background: var(--mp-indicator-bg, rgb(0 0 0 / 0.65));
      font: var(--mp-indicator-font, 600 15px/1.4 var(--mp-font, system-ui, sans-serif));
      font-variant-numeric: tabular-nums;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .indicator.visible {
      opacity: 1;
    }
    video {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: var(--mp-object-fit, contain);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--mp-control-gap, 2px);
    }
    .spacer {
      flex: 1;
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

  /**
   * Keyboard shortcuts, active while focus is inside the player. Set to false
   * to disable, or pass a custom map: `{ ...DEFAULT_SHORTCUTS, s: (c) => … }`.
   */
  @property({ attribute: false }) keyboardShortcuts: ShortcutMap | false = DEFAULT_SHORTCUTS;

  /** Short feedback label shown after a shortcut (e.g. "+10s", "Volume 60%"). */
  @state() private indicator = '';
  private indicatorTimer: ReturnType<typeof setTimeout> | undefined;
  private lastPointerType = 'mouse';

  @query('mp-control-bar') private controlBar!: HTMLElement | null;
  private readonly autoHide: AutoHide;

  private readonly video: HTMLVideoElement;
  /** The player controller; custom controls use it to read state and trigger actions. */
  readonly controller: PlayerController;

  constructor() {
    super();
    this.video = document.createElement('video');
    this.video.setAttribute('part', 'video');
    this.video.playsInline = true;
    this.controller = new PlayerController(this, this.video);
    new ContextProvider(this, { context: playerContext, initialValue: this.controller });
    this.autoHide = new AutoHide(this, this.controller, () => this.controlBar);
    this.controller.store.subscribe(
      (s) => s.controlsVisible,
      (visible) => this.toggleAttribute('data-idle', !visible),
    );
    this.addEventListener('keydown', this.onKeyDown);
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
    // Focusable so keyboard shortcuts work once the player is clicked or tabbed to.
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    // Attributes are already set here, but willUpdate hasn't run yet.
    this.syncControllerOptions();
    this.controller.connect();
    // The muted attribute wins over a remembered volume setting.
    if (this.hasAttribute('muted')) this.video.muted = true;
    // Reconnecting after a DOM move: reload the current source.
    if (this.src && this.hasUpdated) void this.controller.load(this.src);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller.disconnect();
    clearTimeout(this.indicatorTimer);
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
      this.syncControllerOptions();
    }
  }

  private syncControllerOptions() {
    this.controller.updateOptions({
      autoplay: this.autoplay,
      type: this.type || undefined,
      preferNative: this.preferNative,
      persistVolume: !this.noPersistVolume,
    });
  }

  protected updated(changed: PropertyValues<this>) {
    if (changed.has('src') && this.isConnected) void this.controller.load(this.src);
  }

  render() {
    // exportparts lets page CSS style inside each control, e.g. movie-player::part(play-button).
    return html`
      ${this.video}
      <div
        class="click-area"
        @pointerdown=${(e: PointerEvent) => (this.lastPointerType = e.pointerType)}
        @click=${this.onAreaClick}
        @dblclick=${this.onAreaDoubleClick}
      ></div>
      <div class="indicator ${this.indicator ? 'visible' : ''}" part="indicator" role="status">
        ${this.indicator}
      </div>
      <mp-spinner exportparts="spinner"></mp-spinner>
      <mp-big-play exportparts="big-play"></mp-big-play>
      <mp-control-bar part="control-bar">
        <mp-seek-bar
          exportparts="seek-bar, seek-track, seek-buffered, seek-progress, seek-thumb, seek-tooltip"
        ></mp-seek-bar>
        <div class="row" part="control-row">
          <mp-play-button exportparts="button: play-button"></mp-play-button>
          <mp-volume exportparts="mute-button, volume-slider"></mp-volume>
          <mp-time-display exportparts="time, current-time, duration, live"></mp-time-display>
          <span class="spacer"></span>
          <mp-pip-button exportparts="button: pip-button"></mp-pip-button>
          <mp-fullscreen-button exportparts="button: fullscreen-button"></mp-fullscreen-button>
        </div>
      </mp-control-bar>
      <mp-error-overlay exportparts="error, error-message, error-retry"></mp-error-overlay>
    `;
  }

  // ─── Interaction ─────────────────────────────────────────────────────────

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.keyboardShortcuts) return;
    const label = handleShortcut(event, this.controller, this.keyboardShortcuts);
    if (label) this.showIndicator(label);
  };

  private showIndicator(label: string) {
    this.indicator = label;
    clearTimeout(this.indicatorTimer);
    this.indicatorTimer = setTimeout(() => (this.indicator = ''), INDICATOR_MS);
  }

  private onAreaClick = () => {
    // Touch: a tap shows/hides the controls rather than pausing (mobile convention).
    if (this.lastPointerType === 'touch') {
      this.autoHide.toggle();
      return;
    }
    this.controller.togglePlay();
  };

  private onAreaDoubleClick = () => {
    if (this.lastPointerType === 'touch') return;
    // The two clicks already toggled play twice (net no change), so there's
    // no need to delay single clicks to tell them apart.
    void this.controller.toggleFullscreen();
  };

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
