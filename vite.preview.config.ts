import { defineConfig } from 'vite';

// Builds the same new-tab page as a plain website, so it can be previewed
// on any device (including phones) without installing the extension.
export default defineConfig({
  root: 'entrypoints/newtab',
  base: './',
  build: {
    outDir: '../../dist-preview',
    emptyOutDir: true,
  },
});
