import type { HlsConfig } from 'hls.js';
import type { Engine } from './engine.js';
import { HlsEngine, type HlsConstructor } from './hls-engine.js';
import { NativeEngine } from './native-engine.js';

const HLS_MIME = 'application/vnd.apple.mpegurl';

export interface EngineOptions {
  /** MIME type hint for URLs without a .m3u8 extension. */
  type?: string;
  /** Use Safari's native HLS even where hls.js is supported (loses manual quality selection). */
  preferNative?: boolean;
  hlsConfig?: Partial<HlsConfig>;
}

export function isHlsSource(src: string, type?: string): boolean {
  if (type) return /mpegurl/i.test(type);
  return /\.m3u8($|[?#])/i.test(src);
}

/** hls.js is imported lazily so native-only playback never downloads it. */
export const loadHls = (): Promise<HlsConstructor> => import('hls.js').then((m) => m.default);

/**
 * Picks an engine for `src`:
 *  1. non-HLS source → native
 *  2. HLS + preferNative + native HLS support → native
 *  3. HLS + hls.js supported (incl. iOS 17.1+ ManagedMediaSource) → hls.js
 *  4. HLS + native HLS support (older iOS) → native
 *  5. otherwise → null (unsupported)
 */
export async function selectEngine(
  src: string,
  video: HTMLVideoElement,
  options: EngineOptions = {},
  load: () => Promise<HlsConstructor> = loadHls,
): Promise<Engine | null> {
  if (!isHlsSource(src, options.type)) return new NativeEngine();

  const nativeHls = video.canPlayType(HLS_MIME) !== '';
  if (options.preferNative && nativeHls) return new NativeEngine();

  const Hls = await load();
  if (Hls.isSupported()) return new HlsEngine(Hls, options.hlsConfig);
  if (nativeHls) return new NativeEngine();
  return null;
}
