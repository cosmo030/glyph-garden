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
 * Gives the website a real title, a description for link previews and a favicon. The extension
 * keeps "New Tab" as its title, so this is done here rather than in index.html.
 */
function websiteHead(): Plugin {
  const description =
    'A calm new tab of animals drawn with keyboard characters. Feed the koi, or hold still for fireflies.';
  return {
    name: 'glyph-garden-website-head',
    transformIndexHtml: (html) =>
      html.replace(
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
