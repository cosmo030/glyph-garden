// Helpers for the asset scripts: find a Chromium browser, start it headless, talk to it over the
// DevTools protocol, and serve a folder over localhost. Node built-ins only, so there is no new
// dependency, and nothing here talks to the internet.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

/** Finds a Chromium-based browser: CHROME_PATH if set, otherwise the usual install locations. */
export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/brave-browser',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('No Chromium browser found. Set CHROME_PATH to its executable.');
  return found;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

/** Serves `root` on a free localhost port. Returns the origin and a function that stops it. */
export async function serve(root) {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\]\.\.)+/, '');
    let file = join(root, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/**
 * Starts the browser headless with a throwaway profile and returns a page to drive.
 * `page.send(method, params)` is a raw DevTools call; the other helpers wrap the common ones.
 */
export async function openPage({ width, height, transparent = false }) {
  const profile = mkdtempSync(join(tmpdir(), 'glyph-garden-'));
  const child = spawn(
    findBrowser(),
    [
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      `--window-size=${width},${height}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(`Browser did not start:\n${log}`)), 20000);
    child.stderr.on('data', (d) => {
      log += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.on('exit', () => reject(new Error(`Browser exited early:\n${log}`)));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) pending.get(d.id)(d);
  };
  const raw = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
      ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const { targetInfos } = await raw('Target.getTargets');
  const target = targetInfos.find((t) => t.type === 'page');
  const { sessionId } = await raw('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const send = (method, params = {}) => raw(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  if (transparent) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const page = {
    send,
    sleep,
    /** Sets the viewport size (device pixels = CSS pixels). */
    async resize(w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    },
    /** Runs the expression in the page and returns its value (awaits promises). */
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    /** Loads a URL and waits for the load event. */
    async goto(url) {
      const loaded = new Promise((resolve) => {
        const handler = (m) => {
          const d = JSON.parse(m.data);
          if (d.method === 'Page.loadEventFired' && d.sessionId === sessionId) {
            ws.removeEventListener('message', handler);
            resolve();
          }
        };
        ws.addEventListener('message', handler);
      });
      await send('Page.navigate', { url });
      await loaded;
    },
    /** Presses a key in the page. */
    async key(key) {
      await page.eval(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`,
      );
    },
    async mouse(type, x, y) {
      await send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        buttons: type === 'mousePressed' ? 1 : 0,
        clickCount: type === 'mouseMoved' ? 0 : 1,
      });
    },
    /** A PNG of the viewport as a Buffer. */
    async screenshot() {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      return Buffer.from(r.data, 'base64');
    },
    async close() {
      try {
        await raw('Browser.close');
      } catch {
        // the browser may already be gone
      }
      ws.close();
      child.kill();
      await sleep(500);
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // a temp folder left behind is harmless
      }
    },
  };
  return page;
}
