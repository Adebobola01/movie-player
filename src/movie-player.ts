import { LitElement, css, html } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import type Hls from 'hls.js';

/**
 * Phase 0 skeleton: plays an HLS source with hls.js, or natively where
 * hls.js is unsupported (older iOS Safari). Controls, quality selection,
 * subtitles and theming arrive in later phases (see Plan.md).
 */
@customElement('movie-player')
export class MoviePlayer extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: relative;
      background: var(--mp-background, #000);
      aspect-ratio: var(--mp-aspect-ratio, 16 / 9);
    }
    video {
      width: 100%;
      height: 100%;
      display: block;
    }
  `;

  @property() src = '';
  @property() poster = '';
  @property({ type: Boolean }) autoplay = false;
  @property({ type: Boolean }) muted = false;

  @query('video') private video!: HTMLVideoElement;

  private hls: Hls | null = null;

  render() {
    return html`<video
      part="video"
      playsinline
      controls
      poster=${this.poster || ''}
      ?autoplay=${this.autoplay}
      .muted=${this.muted}
    ></video>`;
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has('src')) void this.load(this.src);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.destroyEngine();
  }

  private async load(src: string) {
    this.destroyEngine();
    if (!src) return;

    // hls.js is imported lazily so pages using native HLS never download it.
    const { default: HlsCtor } = await import('hls.js');
    if (src !== this.src) return; // src changed while loading

    if (HlsCtor.isSupported()) {
      this.hls = new HlsCtor({ capLevelToPlayerSize: true });
      this.hls.loadSource(src);
      this.hls.attachMedia(this.video);
    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = src;
    } else {
      this.dispatchEvent(
        new CustomEvent('mp-error', {
          detail: { message: 'HLS is not supported in this browser' },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private destroyEngine() {
    this.hls?.destroy();
    this.hls = null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'movie-player': MoviePlayer;
  }
}
