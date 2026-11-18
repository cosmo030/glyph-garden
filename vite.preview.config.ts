import { defineConfig, type Plugin } from 'vite';

// Builds the same new-tab page as a plain website: the demo at glyph.cosmo030.com, and a way to
// preview on any device (including phones) without installing the extension.
export default defineConfig({
  root: 'entrypoints/newtab',
  base: './',
  // Ships the extension icons with the website, for the favicon below.
  publicDir: '../../public',
  build: {
    outDir: '../../dist-preview',
    emptyOutDir: true,
  },
  plugins: [websiteHead()],
});

/**
 * Gives the website a real title, a description for link previews and a favicon, and takes
 * `autofocus` off the search box. The extension keeps both as they are, so this is done here rather
 * than in index.html.
 */
function websiteHead(): Plugin {
  const description =
    'Calm animated new tab in ASCII art: feed koi in a pond, or watch fireflies under a starry night sky. Private, no tracking.';
  return {
    name: 'glyph-garden-website-head',
    transformIndexHtml: (html) =>
      html
        // On a new tab the cursor belongs in the search box. On the website a focused box would take
        // the arrow keys, which switch scenes, before the visitor has clicked anything. Done at build
        // time because the browser applies autofocus before any script could undo it.
        .replace(/\s+autofocus(?=[\s>])/, '')
        .replace(
          '<title>New Tab</title>',
          [
            '<title>Glyph Garden</title>',
            `<meta name="description" content="${description}" />`,
            '<link rel="icon" type="image/png" sizes="32x32" href="./icon/32.png" />',
            '<link rel="apple-touch-icon" href="./icon/128.png" />',
          ].join('\n    '),
        ),
  };
}
