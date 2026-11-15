import { vi } from 'vitest';
import type { HlsConstructor } from './hls-engine.js';

type Handler = (event: string, data: unknown) => void;

/** Minimal stand-in for hls.js used in unit tests. */
export function createMockHls(supported = true) {
  const instances: MockHls[] = [];

  class MockHls {
    static isSupported = () => supported;
    static Events = { ERROR: 'hlsError', FRAG_BUFFERED: 'hlsFragBuffered' };
    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
      OTHER_ERROR: 'otherError',
    };
    static ErrorDetails = {
      MANIFEST_LOAD_ERROR: 'manifestLoadError',
      MANIFEST_LOAD_TIMEOUT: 'manifestLoadTimeOut',
      MANIFEST_PARSING_ERROR: 'manifestParsingError',
      FRAG_LOAD_ERROR: 'fragLoadError',
    };

    config: unknown;
    handlers = new Map<string, Handler[]>();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    swapAudioCodec = vi.fn();
    destroy = vi.fn();

    constructor(config: unknown) {
      this.config = config;
      instances.push(this);
    }

    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    }

    emit(event: string, data: unknown = {}) {
      for (const h of this.handlers.get(event) ?? []) h(event, data);
    }
  }

  return { Hls: MockHls as unknown as HlsConstructor, instances };
}
