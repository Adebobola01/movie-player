import { fromMediaError } from '../errors.js';
import { ErrorEmitter, type Engine } from './engine.js';

/** Plays a source directly through the <video> element (MP4, or HLS on Safari). */
export class NativeEngine implements Engine {
  readonly name = 'native' as const;
  private video: HTMLVideoElement | null = null;
  private errors = new ErrorEmitter();

  private handleError = () => {
    if (this.video) this.errors.emit(fromMediaError(this.video.error));
  };

  attach(video: HTMLVideoElement): void {
    this.video = video;
    video.addEventListener('error', this.handleError);
  }

  load(src: string): void {
    if (!this.video) throw new Error('NativeEngine.load called before attach');
    this.video.src = src;
    this.video.load();
  }

  destroy(): void {
    if (this.video) {
      this.video.removeEventListener('error', this.handleError);
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.video = null;
    this.errors.clear();
  }

  onError(callback: Parameters<Engine['onError']>[0]) {
    return this.errors.on(callback);
  }
}
