import { LitElement, css, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { PlayerConsumer } from '../player-consumer.js';

/** Shown on fatal errors, with a retry button that resumes where playback stopped. */
@customElement('mp-error-overlay')
export class ErrorOverlay extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .overlay {
      pointer-events: auto;
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 24px;
      text-align: center;
      background: var(--mp-error-bg, rgb(0 0 0 / 0.85));
      color: var(--mp-control-color, #fff);
      font: var(--mp-error-font, 15px/1.5 var(--mp-font, system-ui, sans-serif));
    }
    button {
      all: unset;
      padding: 8px 20px;
      border-radius: var(--mp-control-radius, 8px);
      background: var(--mp-accent, #4f8cff);
      color: var(--mp-accent-contrast, #fff);
      font-weight: 600;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--mp-control-color, #fff);
      outline-offset: 2px;
    }
  `;

  private player = new PlayerConsumer(this, (s) => s.error);

  render() {
    const error = this.player.value;
    if (!error) return nothing;
    const retryable = error.code !== 'UNSUPPORTED';
    return html`<div class="overlay" part="error" role="alert">
      <p part="error-message">${error.message}</p>
      ${
        retryable
          ? html`<button part="error-retry" @click=${() => this.player.controller?.retry()}>
              Try again
            </button>`
          : nothing
      }
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-error-overlay': ErrorOverlay;
  }
}
