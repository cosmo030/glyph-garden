/**
 * App entry point: wires the page together.
 *
 * - Loads saved Tune settings and builds the shared `World` the scenes live in.
 * - Builds the page UI (clock, greeting, search box, scene name, Tune button).
 * - Picks the active scene: it follows the clock, or the one chosen by hand.
 * - Runs the main loop: a fixed-timestep simulation (60 steps per second) and one
 *   render per animation frame. The loop stops completely while the tab is hidden.
 */
import { defaultValues, mergeValues, type Values } from './params/schema';
import { loadSettings, saveSettingsSoon } from './params/store';
import type { Stats } from './params/panel';
import { GlyphRenderer } from './render/renderer';
import { scenes, sceneById, sceneForHour } from './scenes';
import { drawEffects } from './sim/effects-draw';
import { rgb } from './sim/colors';
import { Effects, type Scene, type World } from './sim/world';
import { clockText, greetingFor } from './ui/greeting';

const STEP = 1 / 60; // simulation runs at a fixed 60 steps per second

/** Boots the new-tab page. Called once from `entrypoints/newtab/main.ts`. */
export async function start() {
  const values: Values = defaultValues();
  mergeValues(values, await loadSettings());

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
  const clockEl = $('.clock');
  const greetingEl = $('.greeting');
  const hintEl = $('.hint');
  const nameBtn = $<HTMLButtonElement>('.habitat-name');
  const modeEl = $('.habitat-mode');
  const tuneEl = $('#tune');
  const tuneBtn = $<HTMLButtonElement>('.tune-btn');

  const world: World = {
    cols: 1,
    rows: 1,
    time: 0,
    cursor: { x: 0, y: 0, active: false },
    params: values,
    effects: new Effects(),
  };
  const stats: Stats = { fps: 0, cells: 0, animals: 0 };

  // ---- Scenes ----------------------------------------------------------------
  /** The scene that should be on show now: by the clock, or the one picked by hand. */
  function pickScene(): Scene {
    const p = values.page;
    if (p.autoScene) {
      const now = new Date();
      return sceneForHour(scenes, now.getHours() + now.getMinutes() / 60, p);
    }
    return sceneById(scenes, p.scene) ?? scenes[0]!;
  }

  let active: Scene = pickScene();

  /** Switches to the scene `pickScene` wants, if it changed. Returns true when it switched. */
  function refreshScene(): boolean {
    const next = pickScene();
    if (next === active) return false;
    active = next;
    active.enter(world);
    return true;
  }

  /**
   * Moves one step through the ring: Auto -> each scene in order -> Auto. A hand pick turns
   * "Scene follows the clock" off and is saved; coming back round to Auto turns it on again.
   */
  function cycleScene(direction: 1 | -1) {
    if (scenes.length < 2) return; // one scene: nothing to choose
    const p = values.page;
    const slots = scenes.length + 1; // slot 0 is Auto
    const here = p.autoScene ? 0 : 1 + Math.max(0, scenes.indexOf(sceneById(scenes, p.scene) ?? scenes[0]!));
    const next = (here + direction + slots) % slots;
    p.autoScene = next === 0;
    if (next > 0) p.scene = scenes[next - 1]!.id;
    saveSettingsSoon(values);
    sync();
    panel?.refreshPanel();
  }

  nameBtn.addEventListener('click', () => cycleScene(1));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    // Arrow keys belong to text fields (the search box, the Tune panel's inputs) while they have focus.
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    cycleScene(e.key === 'ArrowRight' ? 1 : -1);
  });

  // ---- Page UI -------------------------------------------------------------
  /** Refreshes everything on the page that depends on the time, the active scene or Page settings. */
  function updatePage() {
    const p = values.page;
    const now = new Date();
    clockEl.textContent = clockText(now);
    greetingEl.textContent = greetingFor(now, p.name, active.greetings);
    document.documentElement.style.setProperty('--glass-blur', `${p.searchBlur}px`);
    document.documentElement.style.setProperty('--glass-tint', String(p.searchOpacity));

    // Bottom-left: the scene name, and (when there is a choice) whether it follows the clock
    const many = scenes.length > 1;
    nameBtn.textContent = `~ ${active.name.toLowerCase()} ~`;
    nameBtn.disabled = !many;
    modeEl.textContent = many && p.autoScene ? 'auto' : '';
    if (many)
      nameBtn.setAttribute('aria-label', `Scene: ${active.name}${p.autoScene ? ', automatic' : ''}. Switch scene`);
    else nameBtn.removeAttribute('aria-label');
    hintEl.textContent = p.showHint ? active.hint : '';
  }

  /** Re-checks the clock: switches scene if the time of day calls for it, then redraws the page text. */
  function sync() {
    refreshScene();
    updatePage();
  }
  updatePage();

  // Re-check once a minute, on the minute, so the clock changes when the real clock does.
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleTick() {
    clearTimeout(tickTimer);
    const d = new Date();
    const untilNextMinute = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
    tickTimer = setTimeout(() => {
      sync();
      scheduleTick();
    }, untilNextMinute + 50);
  }
  scheduleTick();

  $<HTMLFormElement>('.search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (new FormData(e.target as HTMLFormElement).get('q') as string).trim();
    if (q) search(q);
  });

  // ---- Tune panel (built on first open, so new tabs load fast) ---------------
  let panel: typeof import('./params/panel') | null = null;
  let panelBuilt = false;
  tuneBtn.addEventListener('click', async () => {
    const open = tuneEl.hidden;
    tuneEl.hidden = !open;
    tuneBtn.setAttribute('aria-expanded', String(open));
    if (open && !panelBuilt) {
      panelBuilt = true;
      panel = await import('./params/panel');
      panel.createPanel(tuneEl, values, stats, onChange);
    }
  });

  /** Called by the Tune panel whenever a value changes. */
  function onChange(group: string, key: string) {
    saveSettingsSoon(values);
    if (group === 'world' && (key === 'cellSize' || key === 'maxDpr')) layout();
    if (group === 'page') sync();
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

  /** Sizes the canvas to the window and rescales creature positions to the new grid. */
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
      for (const s of scenes) s.rescale(sx, sy, world);
    }
  }
  layout();
  window.addEventListener('resize', layout);
  active.enter(world);
  // Test hook: ?debug exposes the world for automated screenshots
  if (location.search.includes('debug')) (window as unknown as Record<string, unknown>).__gg = { world, scenes };

  // ---- Input -------------------------------------------------------------------
  const toCell = (e: PointerEvent) => {
    const c = values.world.cellSize;
    return [e.clientX / c, e.clientY / c] as const;
  };
  // The scene a press started on, so the matching pointerUp goes to the same scene
  let pressedOn: Scene | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = toCell(e);
    world.cursor.x = x;
    world.cursor.y = y;
    pressedOn = active;
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
    if (pressedOn) {
      const [x, y] = toCell(e);
      pressedOn.pointerUp(x, y, world);
      pressedOn = null;
    }
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
      background: rgb(active.background?.(world) ?? w.background),
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

  // Stop completely while the tab is hidden; check the clock again as soon as it is shown
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else {
      last = performance.now();
      acc = 0;
      sync();
      scheduleTick();
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
