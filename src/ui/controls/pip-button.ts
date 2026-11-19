import { LitElement, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { icons } from '../icons.js';
import { PlayerConsumer } from '../player-consumer.js';
import { buttonStyles } from '../styles.js';

@customElement('mp-pip-button')
export class PipButton extends LitElement {
  static styles = buttonStyles;
  private player = new PlayerConsumer(this, (s) => ({ pip: s.pip, supported: s.capabilities.pip }));

  render() {
    const value = this.player.value;
    this.hidden = !value?.supported;
    if (!value?.supported) return nothing;
    const label = value.pip ? 'Exit picture-in-picture' : 'Picture-in-picture';
    return html`<button
      part="button"
      aria-label=${label}
      aria-pressed=${value.pip ? 'true' : 'false'}
      title=${`${label} (p)`}
      @click=${() => this.player.controller?.togglePip()}
    >
      ${icons.pip}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-pip-button': PipButton;
  }
}
