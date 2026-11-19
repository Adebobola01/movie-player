type Listener<T> = (state: T, prev: T) => void;

/**
 * Minimal immutable state store. `subscribe` with a selector only fires when
 * the selected slice changes (compared with Object.is, or a custom equality).
 */
export class Store<T extends object> {
  private state: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.state = initial;
  }

  get(): T {
    return this.state;
  }

  set(partial: Partial<T>): void {
    const prev = this.state;
    let changed = false;
    for (const key in partial) {
      if (!Object.is(prev[key], partial[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...prev, ...partial };
    for (const listener of [...this.listeners]) listener(this.state, prev);
  }

  /** Subscribe to the whole state. Returns an unsubscribe function. */
  subscribe(listener: Listener<T>): () => void;
  /** Subscribe to a slice; `callback` fires only when the slice changes. */
  subscribe<S>(
    selector: (state: T) => S,
    callback: (slice: S, prev: S) => void,
    equals?: (a: S, b: S) => boolean,
  ): () => void;
  subscribe<S>(
    selectorOrListener: ((state: T) => S) | Listener<T>,
    callback?: (slice: S, prev: S) => void,
    equals: (a: S, b: S) => boolean = Object.is,
  ): () => void {
    let listener: Listener<T>;
    if (callback) {
      const selector = selectorOrListener as (state: T) => S;
      listener = (state, prev) => {
        const next = selector(state);
        const before = selector(prev);
        if (!equals(next, before)) callback(next, before);
      };
    } else {
      listener = selectorOrListener as Listener<T>;
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Shallow equality for arrays/objects, useful as a selector `equals`. */
export function shallowEqual<S>(a: S, b: S): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a) as (keyof S)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}
