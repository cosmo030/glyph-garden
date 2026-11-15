import { Pane } from 'tweakpane';
import { schema, defaultValues, mergeValues, type Values, type Param } from './schema';

export type Stats = { fps: number; cells: number; animals: number };

type Change = (group: string, key: string) => void;

// The panel that is currently on screen (it is rebuilt by "Reset everything").
let current: Pane | null = null;

/** Re-reads every value into the open panel, for when the page changes a setting itself (e.g. cycling scenes). */
export function refreshPanel(): void {
  current?.refresh();
}

/**
 * Builds the Tune panel straight from the schema: one folder per group,
 * one control per parameter, plus preset tools and a live performance readout.
 */
export function createPanel(container: HTMLElement, values: Values, stats: Stats, onChange: Change) {
  const pane = new Pane({ container, title: 'Tune' });
  current = pane;
  const bag = values as unknown as Record<string, Record<string, unknown>>;

  const perf = pane.addFolder({ title: 'Performance', expanded: false });
  perf.addBinding(stats, 'fps', { readonly: true, label: 'FPS', format: (v: number) => v.toFixed(0) });
  perf.addBinding(stats, 'cells', { readonly: true, label: 'Cells drawn', format: (v: number) => v.toFixed(0) });
  perf.addBinding(stats, 'animals', { readonly: true, label: 'Animals', format: (v: number) => v.toFixed(0) });

  for (const [g, group] of Object.entries(schema)) {
    const folder = pane.addFolder({ title: group.label, expanded: 'expanded' in group ? group.expanded : false });
    for (const [k, p] of Object.entries(group.params as Record<string, Param>)) {
      if (p.kind === 'text' && p.hidden) continue; // saved, but not a control
      const opts: Record<string, unknown> = { label: p.label };
      if (p.kind === 'number') Object.assign(opts, { min: p.min, max: p.max, step: p.step });
      if (p.kind === 'color') opts.view = 'color';
      folder.addBinding(bag[g], k, opts).on('change', () => onChange(g, k));
    }
    folder.addButton({ title: `Reset ${group.label.toLowerCase()}` }).on('click', () => {
      const d = defaultValues() as unknown as Record<string, Record<string, unknown>>;
      Object.assign(bag[g], d[g]);
      pane.refresh();
      for (const k of Object.keys(group.params)) onChange(g, k);
    });
  }

  const presets = pane.addFolder({ title: 'Presets', expanded: false });
  presets.addButton({ title: 'Copy settings' }).on('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(values, null, 2));
      flash(container, 'Copied to clipboard');
    } catch {
      showBox(JSON.stringify(values));
      flash(container, 'Copy the text below');
    }
  });
  presets.addButton({ title: 'Paste settings' }).on('click', () => showBox(''));
  // A second click within 3 seconds confirms (browser confirm dialogs are blocked in previews)
  let armed = 0;
  const resetBtn = presets.addButton({ title: 'Reset everything' });
  resetBtn.on('click', () => {
    if (Date.now() - armed > 3000) {
      armed = Date.now();
      resetBtn.title = 'Click again to reset';
      setTimeout(() => (resetBtn.title = 'Reset everything'), 3000);
      return;
    }
    Object.assign(values, defaultValues());
    // Object.assign replaced the group objects, so rebuild the panel bindings.
    clearInterval(refresher);
    container.innerHTML = '';
    pane.dispose();
    createPanel(container, values, stats, onChange);
    all(onChange);
  });

  // Text box for pasting or copying settings JSON
  const box = document.createElement('div');
  box.className = 'tune-box';
  box.hidden = true;
  box.innerHTML =
    '<textarea spellcheck="false" placeholder="Paste settings JSON here"></textarea><div><button type="button" data-act="apply">Apply</button><button type="button" data-act="close">Close</button></div>';
  container.appendChild(box);
  const area = box.querySelector('textarea')!;
  function showBox(text: string) {
    box.hidden = false;
    area.value = text;
    area.focus();
    area.select();
  }
  box.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === 'close') box.hidden = true;
    if (act === 'apply') {
      try {
        mergeValues(values, JSON.parse(area.value));
        pane.refresh();
        all(onChange);
        box.hidden = true;
        flash(container, 'Settings loaded');
      } catch {
        flash(container, 'That is not valid settings JSON');
      }
    }
  });

  const refresher = setInterval(() => perf.expanded && pane.refresh(), 500);
  return pane;
}

/** Notifies about every parameter (after a reset or paste replaced many values at once). */
function all(onChange: Change) {
  for (const [g, group] of Object.entries(schema)) for (const k of Object.keys(group.params)) onChange(g, k);
}

/** Shows a short message at the bottom of the panel. */
function flash(container: HTMLElement, msg: string) {
  const el = document.createElement('div');
  el.className = 'tune-toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}
