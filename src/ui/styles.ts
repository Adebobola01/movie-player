import { css } from 'lit';

/** Shared look for icon buttons. Everything is overridable via --mp-* variables. */
export const buttonStyles = css`
  :host {
    display: inline-flex;
  }
  :host([hidden]) {
    display: none;
  }
  button {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--mp-control-size, 40px);
    height: var(--mp-control-size, 40px);
    border-radius: var(--mp-control-radius, 8px);
    color: var(--mp-control-color, #fff);
    cursor: pointer;
    transition:
      background-color 0.15s,
      transform 0.1s;
  }
  button:hover {
    background: var(--mp-control-hover-bg, rgb(255 255 255 / 0.15));
  }
  button:active {
    transform: scale(0.92);
  }
  button:focus-visible {
    outline: 2px solid var(--mp-focus-ring, var(--mp-accent, #4f8cff));
    outline-offset: 2px;
  }
  svg {
    width: var(--mp-icon-size, 24px);
    height: var(--mp-icon-size, 24px);
  }
`;
