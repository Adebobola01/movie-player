import type Hls from 'hls.js';
import type { ErrorData, HlsConfig } from 'hls.js';
import { createError } from '../errors.js';
import { ErrorEmitter, type Engine } from './engine.js';

export type HlsConstructor = typeof Hls;

const NETWORK_RETRY_DELAYS_MS = [1000, 2000, 4000];
/** A second media error within this window escalates recovery. */
const MEDIA_RECOVERY_WINDOW_MS = 10_000;

/**
 * Streams HLS through hls.js, with the recovery strategy hls.js recommends:
 *  - network errors: restart loading with backoff, then give up
 *  - media errors: recoverMediaError, then swapAudioCodec + recover, then give up
 */
export class HlsEngine implements Engine {
  readonly name = 'hls.js' as const;
  private hls: Hls;
  private errors = new ErrorEmitter();
  private networkRetries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private lastMediaRecovery = 0;
  private mediaRecoveries = 0;

  constructor(
    private Ctor: HlsConstructor,
    config: Partial<HlsConfig> = {},
  ) {
    this.hls = new Ctor({ capLevelToPlayerSize: true, ...config });
    this.hls.on(Ctor.Events.ERROR, (_event, data) => this.handleError(data));
    // A fragment buffering successfully means the stream is healthy again.
    this.hls.on(Ctor.Events.FRAG_BUFFERED, () => {
      this.networkRetries = 0;
    });
  }

  /** The underlying hls.js instance, for advanced use. */
  get instance(): Hls {
    return this.hls;
  }

  attach(video: HTMLVideoElement): void {
    this.hls.attachMedia(video);
  }

  load(src: string): void {
    this.hls.loadSource(src);
  }

  destroy(): void {
    clearTimeout(this.retryTimer);
    this.hls.destroy();
    this.errors.clear();
  }

  onError(callback: Parameters<Engine['onError']>[0]) {
    return this.errors.on(callback);
  }

  private handleError(data: ErrorData): void {
    const { ErrorTypes, ErrorDetails } = this.Ctor;
    if (!data.fatal) return; // hls.js handles non-fatal errors itself

    if (data.type === ErrorTypes.NETWORK_ERROR) {
      // hls.js already retried the manifest using its own load policy.
      const manifestFailure =
        data.details === ErrorDetails.MANIFEST_LOAD_ERROR ||
        data.details === ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
        data.details === ErrorDetails.MANIFEST_PARSING_ERROR;
      if (!manifestFailure && this.networkRetries < NETWORK_RETRY_DELAYS_MS.length) {
        const delay = NETWORK_RETRY_DELAYS_MS[this.networkRetries++];
        this.emitWarning('NETWORK', `Network error, retrying in ${delay / 1000}s`, data);
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => this.hls.startLoad(), delay);
        return;
      }
      this.fail('NETWORK', 'The video could not be loaded. Check your connection.', data);
      return;
    }

    if (data.type === ErrorTypes.MEDIA_ERROR) {
      const now = Date.now();
      if (now - this.lastMediaRecovery > MEDIA_RECOVERY_WINDOW_MS) this.mediaRecoveries = 0;
      this.lastMediaRecovery = now;
      this.mediaRecoveries++;
      if (this.mediaRecoveries === 1) {
        this.emitWarning('MEDIA', 'Media error, attempting recovery', data);
        this.hls.recoverMediaError();
        return;
      }
      if (this.mediaRecoveries === 2) {
        this.emitWarning('MEDIA', 'Media error, retrying with alternate audio codec', data);
        this.hls.swapAudioCodec();
        this.hls.recoverMediaError();
        return;
      }
      this.fail('MEDIA', 'The video could not be played.', data);
      return;
    }

    this.fail('UNKNOWN', data.error?.message || 'An unknown playback error occurred', data);
  }

  private emitWarning(code: 'NETWORK' | 'MEDIA', message: string, cause: ErrorData) {
    this.errors.emit(createError(code, message, { fatal: false, cause }));
  }

  private fail(code: 'NETWORK' | 'MEDIA' | 'UNKNOWN', message: string, cause: ErrorData) {
    clearTimeout(this.retryTimer);
    this.errors.emit(createError(code, message, { fatal: true, cause }));
  }
}
