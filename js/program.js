// Program page: edit days, exercises, sets and rep ranges. Past workouts are never changed.

import * as C from './calc.js';
import { MUSCLES, seedProgram } from './seed.js';
import { esc, $, $$, toast, openSheet, confirmSheet, hBars } from './ui.js';
import { pickExercise } from './log.js';
import { newId } from './store.js';

const view = { open: null, includeOptional: false };
const clone = o => JSON.parse(JSON.stringify(o));

export function renderProgram(ctx) {
  const { store } = ctx;
  const p = store.program;
  const band = [store.settings.targetMin, store.settings.targetMax];
  const dayIds = p.days.filter(d => view.includeOptional || !d.optional).map(d => d.id);
  const planned = C.plannedVolume(p, dayIds);
  const rows = [...new Set([...MUSCLES, ...Object.keys(planned)])].map(m => ({ label: m, value: planned[m] || 0 }))
    .sort((a, b) => a.value - b.value);
  const exercises = Object.values(p.exercises).sort((a, b) => a.name.localeCompare(b.name));

  const html = `
    <div class="card">
      <div class="card-head"><h3>Planned weekly sets</h3></div>
      <label class="check"><input type="checkbox" data-incl ${view.includeOptional ? 'checked' : ''}> Include optional days</label>
      <p class="muted small">If you do every set of the days above. Helps you keep all muscles at the same volume.</p>
      ${hBars(rows, { band, format: v => C.fmtNum(v) })}
    </div>

    <h2 class="section">Days</h2>
    ${p.days.map((d, di) => `
      <div class="card day-card ${view.open === d.id ? 'open' : ''}">
        <button class="day-toggle" data-toggle="${esc(d.id)}">
          <div><div class="title">${esc(d.name)} ${d.optional ? '<span class="tag">optional</span>' : ''}</div>
          <div class="muted small">${esc(d.focus || '')} · ${d.slots.length} exercises · ${d.slots.reduce((a, s) => a + s.sets, 0)} sets</div></div>
          <span class="chev">${view.open === d.id ? '⌄' : '›'}</span>
        </button>
        ${view.open === d.id ? `
          <div class="list">
            ${d.slots.map((sl, si) => {
              const ex = p.exercises[sl.exId];
              return `<button class="list-row" data-slot="${di}:${si}">
                <div>${sl.ss ? `<span class="ss">SS ${esc(sl.ss)}</span> ` : ''}${esc(ex?.name || '(deleted exercise)')}</div>
                <div class="right muted">${sl.sets} × ${sl.repMin}–${sl.repMax}</div>
              </button>`;
            }).join('')}
          </div>
          <div class="row gap wrap">
            <button class="btn small" data-add-slot="${di}">＋ Add exercise</button>
            <button class="btn small ghost" data-edit-day="${di}">Edit day</button>
          </div>` : ''}
      </div>`).join('')}
    <button class="btn ghost wide" data-add-day>＋ Add day</button>

    <h2 class="section">Exercises <span class="muted small">${exercises.length}</span></h2>
    <div class="card list">
      ${exercises.map(x => `<button class="list-row" data-ex="${esc(x.id)}">
        <div>${esc(x.name)}${x.archived ? ' <span class="tag">archived</span>' : ''}</div>
        <div class="right muted small">${esc(x.primary.join(', '))}${x.secondary.length ? ' + ½ ' + esc(x.secondary.join(', ')) : ''}</div>
      </button>`).join('')}
    </div>
    <button class="btn ghost wide" data-new-ex>＋ New exercise</button>
  `;

  return {
    html,
    mount(root) {
      $('[data-incl]', root).addEventListener('change', e => { view.includeOptional = e.target.checked; ctx.render(); });
      root.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const prog = clone(store.program);
        if (b.dataset.toggle) { view.open = view.open === b.dataset.toggle ? null : b.dataset.toggle; ctx.render(); }
        else if (b.dataset.slot) { const [di, si] = b.dataset.slot.split(':').map(Number); editSlot(store, prog, di, si); }
        else if (b.dataset.addSlot) {
          const di = +b.dataset.addSlot;
          pickExercise(store, ex => {
            prog.days[di].slots.push({ exId: ex.id, sets: 3, repMin: 8, repMax: 12, ss: '' });
            store.saveProgram(prog); toast(`Added ${ex.name}`);
          }, { title: `Add to ${prog.days[di].name}` });
        }
        else if (b.dataset.editDay) editDay(store, prog, +b.dataset.editDay);
        else if (b.hasAttribute('data-add-day')) {
          const id = newId();
          prog.days.push({ id, name: 'New day', focus: '', optional: false, slots: [] });
          view.open = id;
          store.saveProgram(prog);
          editDay(store, clone(store.program), prog.days.length - 1);
        }
        else if (b.dataset.ex) editExercise(store, prog, b.dataset.ex);
        else if (b.hasAttribute('data-new-ex')) editExercise(store, prog, null);
      });
    },
  };
}

function numField(label, name, value, min = 1, max = 100) {
  return `<label class="field"><span>${label}</span><input type="number" inputmode="numeric" name="${name}" value="${value}" min="${min}" max="${max}"></label>`;
}

function editSlot(store, prog, di, si) {
  const day = prog.days[di];
  const sl = day.slots[si];
  const ex = prog.exercises[sl.exId];
  openSheet(`
    <h2>${esc(ex?.name || 'Exercise')}</h2>
    <p class="muted small">In ${esc(day.name)}. Changes apply to new workouts only.</p>
    <div class="grid3">
      ${numField('Sets', 'sets', sl.sets)}
      ${numField('Min reps', 'repMin', sl.repMin)}
      ${numField('Max reps', 'repMax', sl.repMax)}
    </div>
    <label class="field"><span>Superset label (same letter = done together)</span>
      <input name="ss" value="${esc(sl.ss)}" maxlength="2" placeholder="e.g. A"></label>
    <div class="row gap wrap">
      <button class="btn small ghost" data-move="-1" ${si === 0 ? 'disabled' : ''}>↑ Move up</button>
      <button class="btn small ghost" data-move="1" ${si === day.slots.length - 1 ? 'disabled' : ''}>↓ Move down</button>
      <button class="btn small danger ghost" data-remove>Remove from day</button>
    </div>
    <div class="row gap end"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-save>Save</button></div>
  `, (sheet, close) => {
    sheet.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.move) {
        const to = si + +b.dataset.move;
        [day.slots[si], day.slots[to]] = [day.slots[to], day.slots[si]];
        store.saveProgram(prog); close();
      } else if (b.hasAttribute('data-remove')) {
        day.slots.splice(si, 1); store.saveProgram(prog); close(); toast('Removed from day');
      } else if (b.hasAttribute('data-save')) {
        const v = n => Math.max(1, Math.round(Number($(`[name=${n}]`, sheet).value) || 1));
        sl.sets = v('sets'); sl.repMin = v('repMin'); sl.repMax = Math.max(v('repMax'), sl.repMin);
        sl.ss = $('[name=ss]', sheet).value.trim().toUpperCase();
        store.saveProgram(prog); close(); toast('Saved');
      }
    });
  });
}

function editDay(store, prog, di) {
  const d = prog.days[di];
  openSheet(`
    <h2>Edit day</h2>
    <label class="field"><span>Name</span><input name="name" value="${esc(d.name)}" maxlength="40"></label>
    <label class="field"><span>Focus (short description)</span><input name="focus" value="${esc(d.focus || '')}" maxlength="80"></label>
    <label class="check"><input type="checkbox" name="optional" ${d.optional ? 'checked' : ''}> Optional day</label>
    <div class="row gap wrap">
      <button class="btn small ghost" data-move="-1" ${di === 0 ? 'disabled' : ''}>↑ Move up</button>
      <button class="btn small ghost" data-move="1" ${di === prog.days.length - 1 ? 'disabled' : ''}>↓ Move down</button>
      <button class="btn small danger ghost" data-del>Delete day</button>
    </div>
    <p class="muted small">Deleting a day keeps all past workouts of that day.</p>
    <div class="row gap end"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-save>Save</button></div>
  `, (sheet, close) => {
    sheet.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.move) {
        const to = di + +b.dataset.move;
        [prog.days[di], prog.days[to]] = [prog.days[to], prog.days[di]];
        store.saveProgram(prog); close();
      } else if (b.hasAttribute('data-del')) {
        close();
        if (await confirmSheet({ title: `Delete ${d.name}?`, body: 'Past workouts stay in History.', confirm: 'Delete', danger: true })) {
          prog.days.splice(di, 1); store.saveProgram(prog); toast('Day deleted');
        }
      } else if (b.hasAttribute('data-save')) {
        d.name = $('[name=name]', sheet).value.trim() || d.name;
        d.focus = $('[name=focus]', sheet).value.trim();
        d.optional = $('[name=optional]', sheet).checked;
        store.saveProgram(prog); close(); toast('Saved');
      }
    });
  });
}

function muscleChips(name, selected) {
  return `<div class="chips" data-group="${name}">${MUSCLES.map(m =>
    `<button type="button" class="chip-btn ${selected.includes(m) ? 'on' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>`;
}

function editExercise(store, prog, id) {
  const isNew = !id;
  const ex = isNew ? { id: newId(), name: '', primary: [], secondary: [], notes: '', archived: false } : prog.exercises[id];
  const usedIn = prog.days.filter(d => d.slots.some(s => s.exId === ex.id)).map(d => d.name);
  openSheet(`
    <h2>${isNew ? 'New exercise' : 'Edit exercise'}</h2>
    <label class="field"><span>Name</span><input name="name" value="${esc(ex.name)}" maxlength="60" placeholder="e.g. Cable Crossover"></label>
    <div class="field"><span>Main muscle (counts as 1 set)</span>${muscleChips('primary', ex.primary)}</div>
    <div class="field"><span>Helper muscles (count as ½ set)</span>${muscleChips('secondary', ex.secondary)}</div>
    <label class="field"><span>Notes</span><input name="notes" value="${esc(ex.notes || '')}" maxlength="140" placeholder="Machine, alternative, cues…"></label>
    ${!isNew ? `<p class="muted small">${usedIn.length ? 'Used in: ' + esc(usedIn.join(', ')) + '. ' : ''}Changing muscles affects new workouts only; past workouts keep their numbers.</p>
      <label class="check"><input type="checkbox" name="archived" ${ex.archived ? 'checked' : ''}> Archived (hidden from Add exercise)</label>` : ''}
    <div class="row gap end"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-save>Save</button></div>
  `, (sheet, close) => {
    sheet.addEventListener('click', e => {
      const chip = e.target.closest('[data-m]');
      if (chip) {
        chip.classList.toggle('on');
        // a muscle cannot be both main and helper
        const other = chip.closest('[data-group]').dataset.group === 'primary' ? 'secondary' : 'primary';
        if (chip.classList.contains('on')) $(`[data-group=${other}] [data-m="${chip.dataset.m}"]`, sheet)?.classList.remove('on');
        return;
      }
      if (!e.target.closest('[data-save]')) return;
      const name = $('[name=name]', sheet).value.trim();
      const primary = $$('[data-group=primary] .on', sheet).map(c => c.dataset.m);
      const secondary = $$('[data-group=secondary] .on', sheet).map(c => c.dataset.m);
      if (!name) { toast('Give it a name'); return; }
      if (!primary.length) { toast('Pick at least one main muscle'); return; }
      Object.assign(ex, { name, primary, secondary, notes: $('[name=notes]', sheet).value.trim() });
      if (!isNew) ex.archived = $('[name=archived]', sheet).checked;
      prog.exercises[ex.id] = ex;
      store.saveProgram(prog); close(); toast(isNew ? 'Exercise created' : 'Saved');
    });
  });
}

export async function resetProgram(store) {
  if (await confirmSheet({ title: 'Reset program to the original plan?', body: 'Days and exercises go back to the PDF plan. Your logged workouts are not touched.', confirm: 'Reset', danger: true })) {
    store.saveProgram(seedProgram()); toast('Program reset');
  }
}
