// The website version of the page, served at glyph.cosmo030.com so people can try the garden
// without installing anything.
//
// It is the same page, search box included, because the search box is what makes it read as a new tab.
// A thin bar at the top says what this is and where to get it, because a visitor has not installed
// anything. On the website the search box doesn't take focus on load (so the arrow keys switch scenes)
// and opens results in a new tab (so the garden stays open): see vite.preview.config.ts and app.ts.

/** Where to get the extension. An entry without `href` is shown as plain text (not available yet). */
const GET_LINKS: readonly { label: string; href?: string }[] = [
  { label: 'add to chrome', href: 'https://chromewebstore.google.com/detail/cekmbhnigpmoekpfgagcaomeglcabbhf' },
  { label: 'firefox soon' },
  { label: 'source', href: 'https://github.com/cosmo030/glyph-garden' },
];

const AUTHOR = { label: 'cosmo030', href: 'https://cosmo030.com' };

/**
 * True when the page should look like the website demo: it is served as a normal website, and the
 * URL does not ask for the plain new-tab look with `?newtab` (the store screenshots use that).
 */
export function isDemo(): boolean {
  // Extension pages get a runtime id; on an ordinary website `chrome.runtime` is missing or has none.
  const g = globalThis as unknown as {
    browser?: { runtime?: { id?: string } };
    chrome?: { runtime?: { id?: string } };
  };
  const isExtension = Boolean(g.browser?.runtime?.id ?? g.chrome?.runtime?.id);
  return !isExtension && !new URLSearchParams(location.search).has('newtab');
}

/** Turns the page into the website demo by adding the top bar. */
export function setUpDemo(ui: HTMLElement): void {
  // The website's title and favicon come from vite.preview.config.ts, so the extension's markup stays
  // untouched.
  const bar = document.createElement('nav');
  bar.className = 'demo-bar';
  bar.setAttribute('aria-label', 'About Glyph Garden');

  const about = document.createElement('p');
  about.className = 'demo-about';
  const name = document.createElement('span');
  name.className = 'demo-name';
  name.textContent = 'glyph garden';
  const tagline = document.createElement('span');
  tagline.className = 'demo-tagline';
  tagline.textContent = 'a new tab drawn in keyboard characters, by ';
  tagline.append(link(AUTHOR.label, AUTHOR.href));
  about.append(name, tagline);

  const get = document.createElement('p');
  get.className = 'demo-get';
  GET_LINKS.forEach((item, i) => {
    if (i > 0) get.append(separator());
    if (item.href) get.append(link(item.label, item.href));
    else {
      const soon = document.createElement('span');
      soon.className = 'demo-soon';
      soon.textContent = item.label;
      get.append(soon);
    }
  });

  bar.append(about, get);
  ui.prepend(bar);
}

/** A link that opens in the same tab (visitors arrive from the portfolio and can go back). */
function link(label: string, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  return a;
}

/** The dot between links, hidden from screen readers so the links are read as a plain list. */
function separator(): HTMLSpanElement {
  const dot = document.createElement('span');
  dot.className = 'demo-sep';
  dot.setAttribute('aria-hidden', 'true');
  dot.textContent = ' · ';
  return dot;
}
