import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { PlayerController } from '../core/controller.js';

export const AUTO_HIDE_DELAY_MS = 3000;

/**
 * Shows the controls on activity and hides them after a period of
 * inactivity while playing. Controls never hide while paused, while the mouse
 * is over the control bar, or while keyboard focus is inside it.
 */
export class AutoHide implements ReactiveController {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pointerOverControls = false;
  private lastInput: 'keyboard' | 'pointer' = 'pointer';
  private unsubscribe: (() => void) | undefined;

  constructor(
    private host: ReactiveControllerHost & HTMLElement,
    private controller: PlayerController,
    private getControlBar: () => Element | null,
    public delay = AUTO_HIDE_DELAY_MS,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    const h = this.host;
    h.addEventListener('pointermove', this.onPointerMove);
    h.addEventListener('pointerdown', this.onPointerDown);
    h.addEventListener('pointerleave', this.onPointerLeave);
    h.addEventListener('pointerover', this.onPointerOver);
    h.addEventListener('pointerout', this.onPointerOut);
    h.addEventListener('keydown', this.onKeyDown);
    h.addEventListener('focusin', this.onFocusIn);
    this.unsubscribe = this.controller.store.subscribe(
      (s) => s.status,
      (status) => (status === 'playing' ? this.schedule() : this.show()),
    );
  }

  hostDisconnected(): void {
    const h = this.host;
    h.removeEventListener('pointermove', this.onPointerMove);
    h.removeEventListener('pointerdown', this.onPointerDown);
    h.removeEventListener('pointerleave', this.onPointerLeave);
    h.removeEventListener('pointerover', this.onPointerOver);
    h.removeEventListener('pointerout', this.onPointerOut);
    h.removeEventListener('keydown', this.onKeyDown);
    h.removeEventListener('focusin', this.onFocusIn);
    this.unsubscribe?.();
    clearTimeout(this.timer);
  }

  /** Shows the controls and restarts the hide timer. */
  show(): void {
    this.controller.setControlsVisible(true);
    this.schedule();
  }

  /** Hides the controls now, if allowed. */
  hide(): void {
    clearTimeout(this.timer);
    if (this.canHide()) this.controller.setControlsVisible(false);
  }

  toggle(): void {
    if (this.controller.state.controlsVisible) this.hide();
    else this.show();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (this.canHide()) this.timer = setTimeout(() => this.hide(), this.delay);
  }

  private canHide(): boolean {
    return (
      this.controller.state.status === 'playing' &&
      !this.pointerOverControls &&
      !this.keyboardFocusInControls()
    );
  }

  private keyboardFocusInControls(): boolean {
    if (this.lastInput !== 'keyboard') return false;
    const active = this.host.shadowRoot?.activeElement;
    return Boolean(active && this.getControlBar()?.contains(active));
  }

  private isInControls(event: Event) {
    const bar = this.getControlBar();
    return Boolean(bar && event.composedPath().includes(bar));
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') this.show();
  };

  private onPointerDown = (event: PointerEvent) => {
    this.lastInput = 'pointer';
    // Touch taps on the video area toggle visibility (handled by the player);
    // any other press counts as activity.
    if (event.pointerType === 'mouse' || this.isInControls(event)) this.show();
  };

  private onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    this.pointerOverControls = false;
    this.hide();
  };

  private onPointerOver = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && this.isInControls(event)) {
      this.pointerOverControls = true;
      clearTimeout(this.timer);
    }
  };

  private onPointerOut = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && this.isInControls(event)) {
      this.pointerOverControls = false;
      this.schedule();
    }
  };

  private onKeyDown = () => {
    this.lastInput = 'keyboard';
    this.show();
  };

  private onFocusIn = () => {
    if (this.lastInput === 'keyboard') this.show();
  };
}
