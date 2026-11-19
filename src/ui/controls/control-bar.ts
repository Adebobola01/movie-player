import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { PlayerConsumer } from '../player-consumer.js';

/** Bottom bar holding the controls; fades out when the player hides its controls. */
@customElement('mp-control-bar')
export class ControlBar extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      inset: auto 0 0 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--mp-control-bar-padding, 32px 12px 8px);
      background: var(
        --mp-control-bar-bg,
        linear-gradient(to top, rgb(0 0 0 / 0.75), rgb(0 0 0 / 0.35) 60%, transparent)
      );
      transition:
        opacity 0.25s,
        visibility 0.25s;
    }
    :host([data-hidden]) {
      opacity: 0;
      visibility: hidden;
    }
  `;

  private player = new PlayerConsumer(this, (s) => s.controlsVisible);

  render() {
    this.toggleAttribute('data-hidden', this.player.value === false);
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-control-bar': ControlBar;
  }
}
