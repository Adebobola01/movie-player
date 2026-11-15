import { ContextConsumer } from '@lit/context';
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { PlayerController } from '../core/controller.js';
import { shallowEqual } from '../core/store.js';
import type { PlayerState } from '../core/types.js';
import { playerContext } from './context.js';

/**
 * Connects a Lit element to the nearest <movie-player> and re-renders it only
 * when the selected slice of state changes.
 *
 *     private player = new PlayerConsumer(this, (s) => s.status);
 *     render() { … this.player.value … this.player.controller?.togglePlay() }
 */
export class PlayerConsumer<S> implements ReactiveController {
  value: S | undefined;
  controller: PlayerController | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(
    private host: ReactiveControllerHost & HTMLElement,
    private selector: (state: PlayerState) => S,
    private equals: (a: S, b: S) => boolean = shallowEqual,
  ) {
    host.addController(this);
    new ContextConsumer(host, {
      context: playerContext,
      callback: (controller) => this.setController(controller),
    });
  }

  hostConnected(): void {
    if (this.controller && !this.unsubscribe) this.subscribe();
  }

  hostDisconnected(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private setController(controller: PlayerController) {
    if (controller === this.controller) return;
    this.unsubscribe?.();
    this.controller = controller;
    this.subscribe();
  }

  private subscribe() {
    const store = this.controller!.store;
    this.value = this.selector(store.get());
    this.unsubscribe = store.subscribe(
      this.selector,
      (slice) => {
        this.value = slice;
        this.host.requestUpdate();
      },
      this.equals,
    );
    this.host.requestUpdate();
  }
}
