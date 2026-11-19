export type PlayerErrorCode =
  'NETWORK' | 'MEDIA' | 'DECODE' | 'UNSUPPORTED' | 'ABORTED' | 'UNKNOWN';

/** One error shape regardless of which engine produced it. */
export interface PlayerError {
  code: PlayerErrorCode;
  message: string;
  fatal: boolean;
  cause?: unknown;
}

export function createError(
  code: PlayerErrorCode,
  message: string,
  options: { fatal?: boolean; cause?: unknown } = {},
): PlayerError {
  return { code, message, fatal: options.fatal ?? true, cause: options.cause };
}

/** Maps a native HTMLMediaElement MediaError to a PlayerError. */
export function fromMediaError(err: MediaError | null): PlayerError {
  switch (err?.code) {
    case 1:
      return createError('ABORTED', 'Playback was aborted', { cause: err });
    case 2:
      return createError('NETWORK', 'A network error interrupted playback', { cause: err });
    case 3:
      return createError('DECODE', 'The video could not be decoded', { cause: err });
    case 4:
      return createError('UNSUPPORTED', 'This video format is not supported', { cause: err });
    default:
      return createError('UNKNOWN', err?.message || 'An unknown playback error occurred', {
        cause: err,
      });
  }
}
