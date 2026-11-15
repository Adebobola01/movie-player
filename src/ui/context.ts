import { createContext } from '@lit/context';
import type { PlayerController } from '../core/controller.js';

/**
 * Shares the PlayerController with every control inside a <movie-player>,
 * including elements slotted in from the light DOM.
 */
export const playerContext = createContext<PlayerController>(Symbol.for('movie-player'));
