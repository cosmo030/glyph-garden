// Makes public/icon/{16,32,48,128}.png from art/icon.svg. WXT finds these by name and puts them in
// both manifests. The SVG is drawn straight at each size (not scaled down from a big PNG), so the
// 16 px icon is as crisp as the browser can make it.
//
// Run: npm run icons   (needs a Chromium browser; set CHROME_PATH if it is not found)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from './lib/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'art', 'icon.svg'), 'utf8');
const out = join(root, 'public', 'icon');
mkdirSync(out, { recursive: true });

const page = await openPage({ width: 128, height: 128, transparent: true });
try {
  for (const size of [16, 32, 48, 128]) {
    await page.resize(size, size);
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await page.sleep(150);
    writeFileSync(join(out, `${size}.png`), await page.screenshot());
    console.log(`public/icon/${size}.png`);
  }
} finally {
  await page.close();
}
