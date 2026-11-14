import { defaultValues, mergeValues, type Values } from './params/schema';
import { loadSettings, saveSettingsSoon } from './params/store';
import type { Stats } from './params/panel';
import { GlyphRenderer } from './render/renderer';
import { drawEffects } from './sim/effects-draw';
import { rgb } from './sim/colors';
import { Effects, type Species, type World } from './sim/world';
import { Koi } from './species/koi';

const STEP = 1 / 60; // simulation runs at a fixed 60 steps per second

// Every animal from the video. Only koi are built so far; the rest show as "soon".
const ROSTER = [
  { id: 'butterfly', label: 'Butterfly', dot: '#5b8def' },
  { id: 'jellyfish', label: 'Jellyfish', dot: '#d655b8' },
  { id: 'dragonfly', label: 'Dragonfly', dot: '#4fd18b' },
  { id: 'koi', label: 'Koi', dot: '#d9a623' },
  { id: 'frog', label: 'Frog', dot: '#7ccf4a' },
  { id: 'crane', label: 'Crane', dot: '#e8e8e8' },
  { id: 'crab', label: 'Crab', dot: '#e0584f' },
];

export async function start() {
  const values: Values = defaultValues();
  mergeValues(values, await loadSettings());

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
  const greetingEl = $('.greeting');
  const hintEl = $('.hint');
  const toastEl = $('.toast');
  const tweaksEl = $('#tweaks');
  const tweaksBtn = $<HTMLButtonElement>('.tweaks-btn');

  const world: World = {
    cols: 1,
    rows: 1,
    time: 0,
    cursor: { x: 0, y: 0, active: false },
    params: values,
    effects: new Effects(),
  };
  const species: Species[] = [new Koi()];
  let active: Species = species[0]!;
  const stats: Stats = { fps: 0, cells: 0, animals: 0 };

  // ---- Page UI -------------------------------------------------------------
  function updatePage() {
    const p = values.page;
    const hour = new Date().getHours();
    const name = p.name.trim();
    let text: string;
    if (hour < 5 || hour >= 23) text = name ? `Still up, ${name}?` : 'Still up?';
    else if (hour < 12) text = name ? `Good morning, ${name}` : 'Good morning';
    else if (hour < 18) text = name ? `Good afternoon, ${name}` : 'Good afternoon';
    else text = name ? `Good evening, ${name}` : 'Good evening';
    greetingEl.textContent = text;
    hintEl.textContent = p.showHint ? active.hint : '';
    document.documentElement.style.setProperty('--glass-blur', `${p.searchBlur}px`);
    document.documentElement.style.setProperty('--glass-tint', String(p.searchOpacity));
  }
  updatePage();
  setInterval(updatePage, 60_000);

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function toast(msg: string) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  const nav = $('.species');
  for (const s of ROSTER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="dot" style="background:${s.dot}"></span>${s.label}`;
    const impl = species.find((x) => x.id === s.id);
    b.setAttribute('aria-pressed', String(impl === active));
    if (!impl) b.classList.add('soon');
    b.addEventListener('click', () => {
      if (!impl) return toast(`${s.label} coming soon`);
      active = impl;
      active.enter(world);
      nav.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      updatePage();
    });
    nav.appendChild(b);
  }

  $<HTMLFormElement>('.search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (new FormData(e.target as HTMLFormElement).get('q') as string).trim();
    if (q) search(q);
  });

  // ---- Tweaks panel (built on first open, so new tabs load fast) -----------
  let panelBuilt = false;
  tweaksBtn.addEventListener('click', async () => {
    const open = tweaksEl.hidden;
    tweaksEl.hidden = !open;
    tweaksBtn.setAttribute('aria-expanded', String(open));
    if (open && !panelBuilt) {
      panelBuilt = true;
      const { createPanel } = await import('./params/panel');
      createPanel(tweaksEl, values, stats, onChange);
    }
  });

  function onChange(group: string, key: string) {
    saveSettingsSoon(values);
    if (group === 'world' && (key === 'cellSize' || key === 'maxDpr')) layout();
    if (group === 'page') updatePage();
  }

  // ---- Renderer --------------------------------------------------------------
  let renderer: GlyphRenderer;
  try {
    renderer = new GlyphRenderer(canvas);
  } catch {
    const note = document.createElement('div');
    note.className = 'fallback';
    note.textContent = 'Animations need WebGL2, which is turned off in this browser.';
    document.body.appendChild(note);
    return;
  }

  function layout() {
    const w = values.world;
    const dpr = Math.min(window.devicePixelRatio || 1, w.maxDpr);
    const oldCols = world.cols;
    const oldRows = world.rows;
    renderer.resize(window.innerWidth, window.innerHeight, dpr, w.cellSize);
    world.cols = renderer.cols;
    world.rows = renderer.rows;
    if (oldCols > 1) {
      const sx = world.cols / oldCols;
      const sy = world.rows / oldRows;
      for (const s of species) s.rescale(sx, sy, world);
    }
  }
  layout();
  window.addEventListener('resize', layout);
  active.enter(world);

  // ---- Input -------------------------------------------------------------------
  const toCell = (e: PointerEvent) => {
    const c = values.world.cellSize;
    return [e.clientX / c, e.clientY / c] as const;
  };
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = toCell(e);
    world.cursor.x = x;
    world.cursor.y = y;
    active.pointerDown(x, y, world);
  });
  window.addEventListener('pointermove', (e) => {
    const [x, y] = toCell(e);
    world.cursor.x = x;
    world.cursor.y = y;
    world.cursor.active = e.pointerType === 'mouse' || e.buttons > 0;
  });
  const release = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') world.cursor.active = false;
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  document.addEventListener('pointerleave', () => (world.cursor.active = false));
  document.addEventListener('mouseleave', () => (world.cursor.active = false));

  // ---- Main loop ---------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let fpsT = last;
  let raf = 0;

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt * values.world.timeScale;
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      world.time += STEP;
      world.effects.step(STEP);
      active.step(STEP, world);
      acc -= STEP;
      steps++;
    }
    if (steps === 6) acc = 0;

    renderer.begin();
    active.draw(renderer, world);
    drawEffects(renderer, world);
    const w = values.world;
    renderer.draw({
      background: rgb(w.background),
      gridOpacity: w.gridOpacity,
      gridEvery: w.gridEvery,
      tileFill: w.tileFill,
      tileRadius: w.tileRadius,
      glyphScale: w.glyphScale,
    });

    frames++;
    if (now - fpsT >= 500) {
      stats.fps = (frames * 1000) / (now - fpsT);
      stats.cells = renderer.count;
      stats.animals = active.count();
      frames = 0;
      fpsT = now;
    }
  }
  raf = requestAnimationFrame(frame);

  // Stop completely while the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else {
      last = performance.now();
      acc = 0;
      updatePage();
      raf = requestAnimationFrame(frame);
    }
  });
}

/** Sends a query to the user's default search engine. */
function search(q: string) {
  const g = globalThis as unknown as {
    browser?: { search?: { query?: (o: object) => Promise<void> } };
    chrome?: { search?: { query?: (o: object) => Promise<void> } };
  };
  const searchApi = g.browser?.search?.query ? g.browser.search : g.chrome?.search?.query ? g.chrome.search : null;
  if (searchApi?.query) {
    void searchApi.query({ text: q, disposition: 'CURRENT_TAB' });
  } else {
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
}
