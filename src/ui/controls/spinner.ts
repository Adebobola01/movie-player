import { LitElement, css, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { PlayerConsumer } from '../player-consumer.js';

/** Buffering indicator; fades in after a short delay so quick stalls don't flash it. */
@customElement('mp-spinner')
export class Spinner extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
    }
    .spinner {
      width: var(--mp-spinner-size, 48px);
      height: var(--mp-spinner-size, 48px);
      border-radius: 50%;
      border: 4px solid var(--mp-spinner-track, rgb(255 255 255 / 0.25));
      border-top-color: var(--mp-accent, #4f8cff);
      opacity: 0;
      animation:
        fade-in 0.2s 0.3s forwards,
        spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        rotate: 360deg;
      }
    }
    @keyframes fade-in {
      to {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: fade-in 0.2s 0.3s forwards;
      }
    }
  `;

  private player = new PlayerConsumer(this, (s) => s.status);

  render() {
    const status = this.player.value;
    if (status !== 'loading' && status !== 'waiting') return nothing;
    return html`<div class="spinner" part="spinner" role="status" aria-label="Loading"></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-spinner': Spinner;
  }
}
