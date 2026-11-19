import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { icons } from '../icons.js';
import { PlayerConsumer } from '../player-consumer.js';
import { buttonStyles } from '../styles.js';

@customElement('mp-play-button')
export class PlayButton extends LitElement {
  static styles = buttonStyles;
  private player = new PlayerConsumer(this, (s) => s.status);

  render() {
    const status = this.player.value;
    const playing = status === 'playing' || status === 'waiting';
    const ended = status === 'ended';
    const label = playing ? 'Pause' : ended ? 'Replay' : 'Play';
    return html`<button
      part="button"
      aria-label=${label}
      title=${`${label} (k)`}
      @click=${() => this.player.controller?.togglePlay()}
    >
      ${playing ? icons.pause : ended ? icons.replay : icons.play}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-play-button': PlayButton;
  }
}
