import { LitElement, css, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { icons } from '../icons.js';
import { PlayerConsumer } from '../player-consumer.js';
import { buttonStyles } from '../styles.js';

/** Mute button plus a volume slider that expands on hover/focus. */
@customElement('mp-volume')
export class Volume extends LitElement {
  static styles = [
    buttonStyles,
    css`
      :host {
        align-items: center;
      }
      input {
        width: 0;
        opacity: 0;
        margin: 0;
        accent-color: var(--mp-accent, #4f8cff);
        cursor: pointer;
        transition:
          width 0.2s,
          opacity 0.2s,
          margin 0.2s;
      }
      :host(:hover) input,
      :host(:focus-within) input {
        width: var(--mp-volume-width, 80px);
        opacity: 1;
        margin-inline: 4px 8px;
      }
    `,
  ];

  private player = new PlayerConsumer(this, (s) => ({
    volume: s.volume,
    muted: s.muted,
    canSetVolume: s.capabilities.volumeControl,
  }));

  render() {
    const value = this.player.value;
    if (!value) return nothing;
    const { volume, muted, canSetVolume } = value;
    const silent = muted || volume === 0;
    const icon = silent ? icons.volumeMuted : volume < 0.5 ? icons.volumeLow : icons.volumeHigh;
    const level = silent ? 0 : Math.round(volume * 100);
    return html`
      <button
        part="button mute-button"
        aria-label=${silent ? 'Unmute' : 'Mute'}
        title=${`${silent ? 'Unmute' : 'Mute'} (m)`}
        @click=${() => this.player.controller?.toggleMute()}
      >
        ${icon}
      </button>
      ${
        canSetVolume
          ? html`<input
              part="volume-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              aria-label="Volume"
              aria-valuetext=${`${level}%`}
              .value=${String(level)}
              @input=${(e: Event) =>
                this.player.controller?.setVolume(
                  Number((e.target as HTMLInputElement).value) / 100,
                )}
              @keydown=${(e: KeyboardEvent) => {
                // The slider handles its own arrows; keep them from the player shortcuts.
                if (e.key.startsWith('Arrow')) e.stopPropagation();
              }}
            />`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-volume': Volume;
  }
}
