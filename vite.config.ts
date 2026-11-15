import { defineConfig } from 'vitest/config';

// Two library builds:
//  - default: ESM for bundlers; lit and hls.js stay external so host apps dedupe them.
//  - cdn: one self-contained file for a plain <script type="module"> tag.
export default defineConfig(({ mode }) => {
  const cdn = mode === 'cdn';
  return {
    build: {
      lib: {
        entry: 'src/index.ts',
        formats: ['es'],
        fileName: () => (cdn ? 'movie-player.cdn.js' : 'movie-player.js'),
      },
      emptyOutDir: !cdn,
      sourcemap: true,
      minify: cdn,
      rolldownOptions: {
        external: cdn ? [] : [/^lit/, /^hls\.js/],
      },
    },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.ts'],
    },
  };
});
