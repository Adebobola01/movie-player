import { describe, expect, it, vi } from 'vitest';
import { Store, shallowEqual } from './store.js';

describe('Store', () => {
  it('merges partial updates immutably', () => {
    const store = new Store({ a: 1, b: 2 });
    const before = store.get();
    store.set({ a: 5 });
    expect(store.get()).toEqual({ a: 5, b: 2 });
    expect(before).toEqual({ a: 1, b: 2 });
  });

  it('does not notify when nothing changed', () => {
    const store = new Store({ a: 1 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ a: 1 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('treats NaN as unchanged', () => {
    const store = new Store({ d: NaN });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ d: NaN });
    expect(listener).not.toHaveBeenCalled();
  });

  it('selector subscriptions fire only when their slice changes', () => {
    const store = new Store({ a: 1, b: 2 });
    const onA = vi.fn();
    store.subscribe((s) => s.a, onA);
    store.set({ b: 3 });
    expect(onA).not.toHaveBeenCalled();
    store.set({ a: 4 });
    expect(onA).toHaveBeenCalledWith(4, 1);
  });

  it('supports custom equality', () => {
    const store = new Store({ r: [1, 2] as number[], x: 0 });
    const cb = vi.fn();
    store.subscribe((s) => s.r, cb, shallowEqual);
    store.set({ r: [1, 2] });
    expect(cb).not.toHaveBeenCalled();
    store.set({ r: [1, 3] });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('unsubscribe stops notifications', () => {
    const store = new Store({ a: 1 });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.set({ a: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});
