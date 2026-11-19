import { LitElement, css, html, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { icons } from '../icons.js';
import { PlayerConsumer } from '../player-consumer.js';

/** Large centred play/replay button shown before playback, when paused and at the end. */
@customElement('mp-big-play')
export class BigPlay extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
    }
    button {
      all: unset;
      pointer-events: auto;
      display: grid;
      place-items: center;
      width: var(--mp-big-play-size, 72px);
      height: var(--mp-big-play-size, 72px);
      border-radius: 50%;
      background: var(--mp-big-play-bg, rgb(0 0 0 / 0.55));
      color: var(--mp-control-color, #fff);
      cursor: pointer;
      transition:
        transform 0.15s,
        background-color 0.15s;
    }
    button:hover {
      transform: scale(1.08);
      background: var(--mp-accent, #4f8cff);
    }
    button:focus-visible {
      outline: 2px solid var(--mp-focus-ring, var(--mp-accent, #4f8cff));
      outline-offset: 3px;
    }
    svg {
      width: 50%;
      height: 50%;
    }
  `;

  private player = new PlayerConsumer(this, (s) => s.status);

  render() {
    const status = this.player.value;
    if (status !== 'ready' && status !== 'paused' && status !== 'ended') return nothing;
    const ended = status === 'ended';
    return html`<button
      part="big-play"
      aria-label=${ended ? 'Replay' : 'Play'}
      @click=${() => this.player.controller?.play()}
    >
      ${ended ? icons.replay : icons.play}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mp-big-play': BigPlay;
  }
}
