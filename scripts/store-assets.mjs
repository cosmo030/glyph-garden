// Regenerates the store images in store/ from the real page, so they can be redone after any change:
//
//   store/screenshots/01-pond.png ... 05-tune-panel.png   1280x800  (Chrome Web Store, Firefox Add-ons)
//   store/promo-440x280.png                               small promo tile (Chrome Web Store)
//   store/marquee-1400x560.png                            marquee promo tile (Chrome Web Store, optional)
//
// It builds the web preview (the same page the extension shows), serves it from localhost, drives a
// headless Chromium browser over the DevTools protocol and takes the pictures. The clock is fixed so
// the greeting and the time read well, and the scenes are shown with their default settings.
// Everything is our own art: the koi, the fireflies and the icon. Nothing is copied from elsewhere.
//
// Run: npm run store:assets   (needs a Chromium browser; set CHROME_PATH if it is not found)
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, serve } from './lib/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'store', 'screenshots');
mkdirSync(shots, { recursive: true });

console.log('Building the web preview...');
execSync('npm run preview:build', { cwd: root, stdio: 'ignore' });
const site = await serve(join(root, 'dist-preview'));
const iconSvg = readFileSync(join(root, 'art', 'icon.svg'), 'utf8');

const page = await openPage({ width: 1280, height: 800 });

/** Makes `new Date()` and `Date.now()` report a fixed local time that then keeps moving. */
const fixClock = (iso) => `(() => {
  const Real = Date; const start = new Real(${JSON.stringify(iso)}).getTime(); const t0 = performance.now();
  class FakeDate extends Real {
    constructor(...a) { if (a.length) super(...a); else super(start + (performance.now() - t0)); }
    static now() { return start + (performance.now() - t0); }
  }
  window.Date = FakeDate;
})()`;

let clockScript;
/** Opens the page at a viewport size with a fixed clock, and waits for the first frames. */
async function load(w, h, iso) {
  if (clockScript) await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockScript });
  ({ identifier: clockScript } = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: fixClock(iso) }));
  await page.resize(w, h);
  await page.goto(`${site.origin}/index.html?debug&newtab`);
  await page.sleep(2500);
}
const save = async (path, png) => {
  writeFileSync(path, png);
  console.log(path.replace(root, '.').replaceAll('\\', '/'));
};
/** Shows the named scene, stepping with the real arrow key (the page remembers the last scene it showed). */
const toScene = async (name) => {
  for (let i = 0; i < 3; i++) {
    if ((await page.eval(`document.querySelector('.habitat-name').textContent`)).includes(name)) break;
    await page.key('ArrowRight');
    await page.sleep(400);
  }
};
const meadow = `window.__gg.scenes.find((s) => s.id === 'meadow')`;
/** Waits until at least `min` fireflies are in a flash, so the picture shows the glow. */
async function waitForFlashes(min) {
  for (let i = 0; i < 60; i++) {
    const lit = await page.eval(
      `(() => { const m = ${meadow}; const L = window.__gg.world.params.meadow.flashLength; let n = 0; for (let i = 0; i < m.n; i++) if (m.phase[i] < L) n++; return n; })()`,
    );
    if (lit >= min) return;
    await page.sleep(250);
  }
}

try {
  // 1. Pond
  await load(1280, 800, '2026-11-15T16:20:00');
  await page.sleep(3000);
  await save(join(shots, '01-pond.png'), await page.screenshot());

  // 2. Pond while feeding: a click drops pellets, and the koi swim in to eat them
  await page.mouse('mouseMoved', 880, 560);
  await page.mouse('mousePressed', 880, 560);
  await page.mouse('mouseReleased', 880, 560);
  await page.sleep(2800);
  await save(join(shots, '02-pond-feeding.png'), await page.screenshot());

  // 3. Meadow, flashing
  await load(1280, 800, '2026-11-15T21:40:00');
  await toScene('meadow');
  await page.sleep(2500);
  await waitForFlashes(30);
  await save(join(shots, '03-meadow-flashing.png'), await page.screenshot());

  // 4. Meadow right after a tap among the fireflies: everything near it flashes at once
  await page.sleep(4000);
  await page.mouse('mouseMoved', 640, 700);
  await page.mouse('mousePressed', 640, 700);
  await page.mouse('mouseReleased', 640, 700);
  await page.sleep(250);
  await save(join(shots, '04-meadow-tap.png'), await page.screenshot());

  // 5. Tune panel open on the Meadow, with its group expanded
  await page.eval(`document.querySelector('.tune-btn').click()`);
  await page.sleep(1500);
  await page.eval(`(() => {
    const folders = [...document.querySelectorAll('#tune .tp-fldv')];
    const title = (f) => f.querySelector('.tp-fldv_t')?.textContent;
    // Open only the Meadow group, so its sliders fill the panel
    for (const f of folders) {
      const open = f.classList.contains('tp-fldv-expanded');
      if (open !== (title(f) === 'Meadow')) f.querySelector('.tp-fldv_t').click();
    }
  })()`);
  await page.sleep(1500);
  await save(join(shots, '05-tune-panel.png'), await page.screenshot());

  // Promo images: the scene art alone (page text hidden), with the icon and name on top
  const promo = async (w, h, iso, scene, count, scale) => {
    await load(w, h, iso);
    await toScene(scene);
    await page.eval(`(() => {
      const g = window.__gg; g.world.params.koi.count = ${scene === 'pond' ? count : 77}; g.world.params.meadow.count = ${scene === 'meadow' ? count : 90};
      document.querySelector('.ui').style.display = 'none';
      const icon = 'data:image/svg+xml;utf8,' + encodeURIComponent(${JSON.stringify(iconSvg)});
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none';
      box.innerHTML = '<div style="display:flex;align-items:center;gap:' + ${scale} * 18 + 'px;padding:' + ${scale} * 18 + 'px ' + ${scale} * 26 + 'px;border-radius:' + ${scale} * 22 + 'px;background:rgba(6,11,22,0.78);box-shadow:0 0 0 1px rgba(214,234,90,0.18)">'
        + '<img src="' + icon + '" width="' + ${scale} * 84 + '" height="' + ${scale} * 84 + '">'
        + '<div style="font-family:ui-monospace,Menlo,Consolas,monospace;line-height:1.25"><div style="font-weight:700;font-size:' + ${scale} * 30 + 'px;color:#f0f7c0;letter-spacing:0.02em">Glyph Garden</div>'
        + '<div style="font-size:' + ${scale} * 13.5 + 'px;color:#a9b4cb;margin-top:' + ${scale} * 4 + 'px">a calm new tab made of<br>keyboard characters</div></div></div>';
      document.body.appendChild(box);
    })()`);
    if (scene === 'meadow') await waitForFlashes(Math.round(count * 0.3));
    else await page.sleep(2500);
    return page.screenshot();
  };
  await save(join(root, 'store', 'promo-440x280.png'), await promo(440, 280, '2026-11-15T21:40:00', 'meadow', 22, 1));
  await save(
    join(root, 'store', 'marquee-1400x560.png'),
    await promo(1400, 560, '2026-11-15T16:20:00', 'pond', 30, 1.9),
  );
} finally {
  await page.close();
  site.close();
}
