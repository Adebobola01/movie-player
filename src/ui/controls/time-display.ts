import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { formatTime } from '../format.js';
import { PlayerConsumer } from '../player-consumer.js';

/** "1:05 / 2:03:00", or a LIVE badge for live streams. */
@customElement('mp-time-display')
export class TimeDisplay extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      padding-inline: 8px;
      color: var(--mp-control-color, #fff);
      font: var(--mp-time-font, 500 13px/1 var(--mp-font, system-ui, sans-serif));
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      user-select: none;
    }
    .live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .live::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mp-live-color, #ff3b30);
    }
    .duration {
      opacity: 0.7;
    }
  `;

  // Whole seconds only, so the per-frame time loop doesn't re-render this every frame.
  private player = new PlayerConsumer(this, (s) => ({
    seconds: Math.floor(s.currentTime),
    duration: s.duration,
    live: s.live,
  }));

  render() {
    const value = this.player.value;
    if (!value) return html``;
    if (value.live) return html`<span class="live" part="live">LIVE</span>`;
    const { seconds, duration } = value;
    return html`<span part="time"
      ><span part="current-time">${formatTime(seconds, duration)}</span>
      <span class="duration" part="duration"> / ${formatTime(duration)}</span></span
    >`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-time-display': TimeDisplay;
  }
}
