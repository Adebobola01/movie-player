import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { formatTime, formatTimeForAria } from '../format.js';
import { PlayerConsumer } from '../player-consumer.js';

const KEY_STEP_SECONDS = 5;

/**
 * Seek bar with buffered ranges, drag-to-seek (pointer capture, works for
 * mouse and touch) and a hover time tooltip. While dragging only a preview
 * is shown; the actual seek happens on release to avoid flooding the network.
 */
@customElement('mp-seek-bar')
export class SeekBar extends LitElement {
  static styles = css`
    :host {
      display: block;
      --_height: var(--mp-seek-height, 4px);
    }
    :host([hidden]) {
      display: none;
    }
    .bar {
      position: relative;
      height: 20px;
      display: flex;
      align-items: center;
      cursor: pointer;
      touch-action: none;
      outline: none;
    }
    .track {
      position: relative;
      width: 100%;
      height: var(--_height);
      border-radius: 999px;
      background: var(--mp-seek-track, rgb(255 255 255 / 0.25));
      transition: height 0.1s;
    }
    .bar:hover .track,
    .bar.dragging .track,
    .bar:focus-visible .track {
      height: calc(var(--_height) * 1.5);
    }
    .buffered,
    .progress {
      position: absolute;
      inset-block: 0;
      border-radius: inherit;
    }
    .buffered {
      background: var(--mp-seek-buffered, rgb(255 255 255 / 0.4));
    }
    .progress {
      left: 0;
      background: var(--mp-accent, #4f8cff);
    }
    .thumb {
      position: absolute;
      top: 50%;
      width: var(--mp-seek-thumb-size, 14px);
      height: var(--mp-seek-thumb-size, 14px);
      border-radius: 50%;
      background: var(--mp-seek-thumb, var(--mp-accent, #4f8cff));
      transform: translate(-50%, -50%) scale(0);
      transition: transform 0.1s;
    }
    .bar:hover .thumb,
    .bar.dragging .thumb,
    .bar:focus-visible .thumb {
      transform: translate(-50%, -50%) scale(1);
    }
    .bar:focus-visible {
      outline: 2px solid var(--mp-focus-ring, var(--mp-accent, #4f8cff));
      outline-offset: 2px;
      border-radius: 4px;
    }
    .tooltip {
      position: absolute;
      bottom: 100%;
      transform: translateX(-50%);
      margin-bottom: 6px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--mp-tooltip-bg, rgb(0 0 0 / 0.8));
      color: var(--mp-control-color, #fff);
      font: var(--mp-tooltip-font, 500 12px/1.4 var(--mp-font, system-ui, sans-serif));
      font-variant-numeric: tabular-nums;
      pointer-events: none;
      white-space: nowrap;
    }
  `;

  private player = new PlayerConsumer(this, (s) => ({
    currentTime: s.currentTime,
    duration: s.duration,
    buffered: s.buffered,
    live: s.live,
  }));

  /** Time shown while dragging, before the seek is committed. */
  @state() private previewTime: number | null = null;
  /** Time under the pointer when hovering. */
  @state() private hoverTime: number | null = null;
  @state() private hoverX = 0;

  render() {
    const value = this.player.value;
    if (!value || value.live) {
      this.hidden = true;
      return nothing;
    }
    this.hidden = false;
    const { currentTime, duration, buffered } = value;
    const known = Number.isFinite(duration) && duration > 0;
    const shown = this.previewTime ?? currentTime;
    const pct = (t: number) => (known ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0);
    const tooltipTime = this.previewTime ?? this.hoverTime;
    const tooltipX = this.previewTime !== null ? pct(this.previewTime) : this.hoverX;

    return html`<div
      class="bar ${this.previewTime !== null ? 'dragging' : ''}"
      part="seek-bar"
      role="slider"
      tabindex="0"
      aria-label="Seek"
      aria-valuemin="0"
      aria-valuemax=${known ? Math.floor(duration) : 0}
      aria-valuenow=${Math.floor(shown)}
      aria-valuetext=${
        known ? `${formatTimeForAria(shown)} of ${formatTimeForAria(duration)}` : 'Loading'
      }
      @pointerdown=${this.onPointerDown}
      @pointermove=${this.onPointerMove}
      @pointerup=${this.onPointerUp}
      @pointercancel=${this.onPointerCancel}
      @pointerleave=${() => (this.hoverTime = null)}
      @keydown=${this.onKeyDown}
    >
      <div class="track" part="seek-track">
        ${buffered.map(
          ([start, end]) =>
            html`<div
              class="buffered"
              part="seek-buffered"
              style=${styleMap({ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` })}
            ></div>`,
        )}
        <div
          class="progress"
          part="seek-progress"
          style=${styleMap({ width: `${pct(shown)}%` })}
        ></div>
        <div class="thumb" part="seek-thumb" style=${styleMap({ left: `${pct(shown)}%` })}></div>
      </div>
      ${
        tooltipTime !== null && known
          ? html`<div
              class="tooltip"
              part="seek-tooltip"
              style=${styleMap({ left: `${tooltipX}%` })}
            >
              ${formatTime(tooltipTime, duration)}
            </div>`
          : nothing
      }
    </div>`;
  }

  private timeAt(event: PointerEvent): { time: number; pct: number } {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = rect.width
      ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      : 0;
    const duration = this.player.value?.duration ?? 0;
    return { time: ratio * (Number.isFinite(duration) ? duration : 0), pct: ratio * 100 };
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.previewTime = this.timeAt(event).time;
  };

  private onPointerMove = (event: PointerEvent) => {
    const { time, pct } = this.timeAt(event);
    if (this.previewTime !== null) this.previewTime = time;
    else if (event.pointerType === 'mouse') {
      this.hoverTime = time;
      this.hoverX = pct;
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.previewTime === null) return;
    this.player.controller?.seek(this.timeAt(event).time);
    this.previewTime = null;
  };

  private onPointerCancel = () => {
    this.previewTime = null;
  };

  private onKeyDown = (event: KeyboardEvent) => {
    const controller = this.player.controller;
    const duration = this.player.value?.duration ?? 0;
    if (!controller || !Number.isFinite(duration)) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => controller.seekBy(-KEY_STEP_SECONDS),
      ArrowDown: () => controller.seekBy(-KEY_STEP_SECONDS),
      ArrowRight: () => controller.seekBy(KEY_STEP_SECONDS),
      ArrowUp: () => controller.seekBy(KEY_STEP_SECONDS),
      PageDown: () => controller.seekBy(-duration / 10),
      PageUp: () => controller.seekBy(duration / 10),
      Home: () => controller.seek(0),
      End: () => controller.seek(duration),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    // Handled here, so the player-level shortcuts must not also act on it.
    event.stopPropagation();
    action();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-seek-bar': SeekBar;
  }
}
