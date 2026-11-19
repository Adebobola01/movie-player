import { LitElement, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { icons } from '../icons.js';
import { PlayerConsumer } from '../player-consumer.js';
import { buttonStyles } from '../styles.js';

@customElement('mp-fullscreen-button')
export class FullscreenButton extends LitElement {
  static styles = buttonStyles;
  private player = new PlayerConsumer(this, (s) => ({
    fullscreen: s.fullscreen,
    supported: s.capabilities.fullscreen,
  }));

  render() {
    const value = this.player.value;
    this.hidden = !value?.supported;
    if (!value?.supported) return nothing;
    const label = value.fullscreen ? 'Exit fullscreen' : 'Fullscreen';
    return html`<button
      part="button"
      aria-label=${label}
      title=${`${label} (f)`}
      @click=${() => this.player.controller?.toggleFullscreen()}
    >
      ${value.fullscreen ? icons.fullscreenExit : icons.fullscreenEnter}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-fullscreen-button': FullscreenButton;
  }
}
