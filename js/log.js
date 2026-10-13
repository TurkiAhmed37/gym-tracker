// Log page: pick a day, then log weight and reps for each set.

import * as C from './calc.js';
import { esc, $, $$, toast, openSheet, confirmSheet } from './ui.js';
import { newId } from './store.js';

const BACKUP_REMINDER_DAYS = 30;

export function renderLogHome(ctx) {
  const { store } = ctx;
  const sessions = store.sessionList();
  const today = C.todayStr();
  const wk = C.weekStart(today);
  const open = sessions.find(s => !s.finished);
  const thisWeek = C.sessionsInWeek(sessions, wk);
  const lastByDay = {};
  for (const s of sessions) if (!lastByDay[s.dayId]) lastByDay[s.dayId] = s.date;

  const lastExport = store.settings.lastExportAt;
  const needBackup = sessions.length > 0 && (!lastExport || (Date.now() - new Date(lastExport)) / 864e5 > BACKUP_REMINDER_DAYS);

  const html = `
    ${needBackup ? `<a class="banner" href="#/settings">💾 Download a backup of your data (last: ${lastExport ? C.shortDate(lastExport.slice(0, 10)) : 'never'})</a>` : ''}
    ${open ? `
      <a class="card continue" href="#/log/${esc(open.id)}">
        <div><div class="eyebrow">In progress</div><div class="title">${esc(open.dayName)}</div>
        <div class="muted small">${C.longDate(open.date)} · ${C.sessionStats(open).sets} sets done</div></div>
        <span class="chev">›</span>
      </a>` : ''}
    <h2 class="section">Start a workout</h2>
    <div class="day-grid">
      ${store.program.days.map(d => `
        <button class="day-btn" data-day="${esc(d.id)}">
          <span class="day-name">${esc(d.name)}${d.optional ? ' <span class="tag">optional</span>' : ''}</span>
          <span class="day-focus">${esc(d.focus || '')}</span>
          <span class="day-last">${lastByDay[d.id] ? 'Last: ' + C.shortDate(lastByDay[d.id]) : 'Not done yet'} · ${d.slots.length} exercises</span>
        </button>`).join('')}
    </div>
    <h2 class="section">This week <span class="muted small">${C.weekLabel(wk)}</span></h2>
    ${thisWeek.length ? `<div class="card list">${thisWeek.map(s => sessionRow(s)).join('')}</div>`
      : `<p class="muted">No workouts yet this week.</p>`}
  `;
  return {
    html,
    mount(root) {
      $$('[data-day]', root).forEach(b => b.addEventListener('click', () => startSession(ctx, b.dataset.day, open)));
    },
  };
}

export function sessionRow(s) {
  const st = C.sessionStats(s);
  return `<a class="list-row" href="#/log/${esc(s.id)}">
    <div><div>${esc(s.dayName)}${s.finished ? '' : ' <span class="tag warn">open</span>'}</div>
    <div class="muted small">${C.longDate(s.date)}</div></div>
    <div class="right"><div>${st.sets} sets</div><div class="muted small">${C.fmtKg(st.tonnage)}</div></div>
  </a>`;
}

async function startSession(ctx, dayId, open) {
  const { store } = ctx;
  if (open) {
    const ok = await confirmSheet({
      title: `You have an open ${open.dayName} workout`,
      body: 'Start a new one anyway? The open one stays saved in History.',
      confirm: 'Start new',
    });
    if (!ok) return;
    store.saveSession({ ...open, finished: true });
  }
  const day = store.program.days.find(d => d.id === dayId);
  const session = {
    id: newId(),
    date: C.todayStr(),
    dayId: day.id,
    dayName: day.name,
    finished: false,
    createdAt: new Date().toISOString(),
    entries: day.slots.filter(sl => store.program.exercises[sl.exId]).map(sl => makeEntry(store.program.exercises[sl.exId], sl)),
  };
  store.saveSession(session);
  ctx.go(`#/log/${session.id}`);
}

function makeEntry(ex, slot) {
  const n = slot?.sets || 3;
  return {
    exId: ex.id, name: ex.name, primary: [...ex.primary], secondary: [...ex.secondary],
    target: slot ? { sets: slot.sets, repMin: slot.repMin, repMax: slot.repMax, ss: slot.ss || '' } : null,
    notes: ex.notes || '',
    sets: Array.from({ length: n }, () => ({ w: null, r: null, done: false })),
  };
}

// ---------- session editor ----------

export function renderSession(ctx, id) {
  const { store } = ctx;
  const stored = store.getSession(id);
  if (!stored) return { html: `<p class="muted">This workout no longer exists.</p><a class="btn" href="#/log">Back</a>` };
  const s = JSON.parse(JSON.stringify(stored));
  const all = store.sessionList();
  const st = C.sessionStats(s);

  const html = `
    <div class="session-head">
      <div>
        <div class="title">${esc(s.dayName)}</div>
        <input type="date" class="date-input" value="${esc(s.date)}" data-date aria-label="Workout date">
      </div>
      <div class="right">
        <div class="big">${st.sets}</div><div class="muted small">sets · ${C.fmtKg(st.tonnage)}</div>
      </div>
    </div>
    ${s.entries.map((e, i) => entryCard(e, i, s, all)).join('')}
    <button class="btn ghost wide" data-add-ex>＋ Add exercise</button>
    <div class="session-actions">
      <button class="btn danger ghost" data-delete>Delete workout</button>
      <button class="btn primary" data-finish>${s.finished ? 'Done' : 'Finish workout'}</button>
    </div>
  `;

  return {
    html,
    mount(root) {
      const save = () => store.saveSession(s);
      const rerender = () => ctx.render();
      const updateHead = () => {
        const st = C.sessionStats(s);
        $('.session-head .big', root).textContent = st.sets;
        $('.session-head .right .small', root).textContent = `sets · ${C.fmtKg(st.tonnage)}`;
      };

      $('[data-date]', root).addEventListener('change', e => {
        if (!e.target.value) return;
        s.date = e.target.value; save(); toast('Date changed');
      });

      root.addEventListener('change', e => {
        const inp = e.target.closest('[data-field]');
        if (!inp) return;
        const set = s.entries[+inp.dataset.e].sets[+inp.dataset.s];
        const v = inp.value === '' ? null : Number(inp.value.replace(',', '.'));
        set[inp.dataset.field] = v != null && !isNaN(v) ? v : null;
        save(); updateHead();
      });

      root.addEventListener('click', async e => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.tick != null) {
          const [ei, si] = t.dataset.tick.split(':').map(Number);
          const set = s.entries[ei].sets[si];
          if (!set.done) {
            const row = t.closest('.set-row');
            const wIn = $('[data-field="w"]', row), rIn = $('[data-field="r"]', row);
            const w = wIn.value !== '' ? Number(wIn.value.replace(',', '.')) : (wIn.placeholder !== '' ? Number(wIn.placeholder) : 0);
            const r = rIn.value !== '' ? Number(rIn.value) : (rIn.placeholder !== '' ? Number(rIn.placeholder) : null);
            if (!r || r <= 0 || isNaN(r)) { rIn.focus(); toast('Enter reps first'); return; }
            set.w = isNaN(w) ? 0 : w; set.r = r; set.done = true;
            wIn.value = set.w; rIn.value = set.r;
          } else {
            set.done = false;
          }
          // update in place (no full redraw, so nothing jumps while logging)
          t.closest('.set-row').classList.toggle('done', set.done);
          save(); updateHead();
        } else if (t.dataset.addSet != null) {
          const en = s.entries[+t.dataset.addSet];
          en.sets.push({ w: null, r: null, done: false });
          save(); rerender();
        } else if (t.dataset.delSet != null) {
          const en = s.entries[+t.dataset.delSet];
          if (en.sets.length) { en.sets.pop(); save(); rerender(); }
        } else if (t.dataset.removeEx != null) {
          const i = +t.dataset.removeEx;
          const en = s.entries[i];
          if (C.countedSets(en).length && !(await confirmSheet({ title: `Remove ${en.name}?`, body: 'Its logged sets in this workout will be deleted.', confirm: 'Remove', danger: true }))) return;
          s.entries.splice(i, 1); save(); rerender();
        } else if (t.dataset.info != null) {
          t.closest('.ex-card').classList.toggle('show-notes');
        } else if (t.hasAttribute('data-add-ex')) {
          pickExercise(store, ex => { s.entries.push(makeEntry(ex, null)); save(); rerender(); });
        } else if (t.hasAttribute('data-finish')) {
          if (!C.sessionStats(s).sets) {
            store.deleteSession(s.id); toast('Nothing logged, workout discarded'); ctx.go('#/log'); return;
          }
          s.finished = true; save();
          toast(`Saved · ${C.sessionStats(s).sets} sets`);
          ctx.go('#/log');
        } else if (t.hasAttribute('data-delete')) {
          if (await confirmSheet({ title: 'Delete this workout?', body: 'All sets logged in it will be removed. This cannot be undone.', confirm: 'Delete', danger: true })) {
            store.deleteSession(s.id); toast('Workout deleted'); ctx.go('#/log');
          }
        }
      });
    },
  };
}

function entryCard(e, i, session, all) {
  const last = C.lastPerformance(all, e.exId, session.id);
  const rec = C.exerciseRecords(all.filter(x => x.id !== session.id), e.exId);
  const t = e.target;
  const muscles = [...e.primary.map(m => `<span class="chip">${esc(m)}</span>`), ...e.secondary.map(m => `<span class="chip sec">${esc(m)} ½</span>`)].join('');
  return `
  <div class="card ex-card">
    <div class="ex-head">
      <div class="ex-title">
        ${t?.ss ? `<span class="ss">SS ${esc(t.ss)}</span>` : ''}
        <span>${esc(e.name)}</span>
      </div>
      <div class="ex-tools">
        ${e.notes ? `<button class="icon-btn" data-info="${i}" aria-label="Notes">ⓘ</button>` : ''}
        <button class="icon-btn" data-remove-ex="${i}" aria-label="Remove exercise">✕</button>
      </div>
    </div>
    <div class="ex-meta">
      ${t ? `<span class="target">${t.sets} × ${t.repMin}–${t.repMax}</span>` : ''}
      ${muscles}
    </div>
    ${e.notes ? `<div class="notes small muted">${esc(e.notes)}</div>` : ''}
    <div class="ex-hist small">
      ${last ? `<div><span class="muted">Last ${C.shortDate(last.date)}:</span> ${last.sets.map(x => `${C.fmtNum(x.w)}×${x.r}`).join(' · ')}</div>` : `<div class="muted">First time: no previous numbers.</div>`}
      ${rec ? `<div><span class="muted">Best:</span> ${C.fmtNum(rec.heaviest.w)} kg × ${rec.heaviest.r} · top volume ${C.fmtKg(rec.bestTonnage.tonnage)}</div>` : ''}
    </div>
    <div class="sets">
      <div class="set-row head small muted"><span>Set</span><span>kg</span><span>Reps</span><span></span></div>
      ${e.sets.map((set, si) => {
        const prev = last?.sets[si] || last?.sets[last.sets.length - 1];
        return `<div class="set-row ${set.done ? 'done' : ''}">
          <span class="set-n">${si + 1}</span>
          <input data-field="w" data-e="${i}" data-s="${si}" inputmode="decimal" type="text" autocomplete="off"
            value="${set.w ?? ''}" placeholder="${prev ? prev.w : ''}" aria-label="Weight set ${si + 1}">
          <input data-field="r" data-e="${i}" data-s="${si}" inputmode="numeric" type="text" autocomplete="off"
            value="${set.r ?? ''}" placeholder="${prev ? prev.r : ''}" aria-label="Reps set ${si + 1}">
          <button class="tick" data-tick="${i}:${si}" aria-label="Done set ${si + 1}">✓</button>
        </div>`;
      }).join('')}
      <div class="set-tools">
        <button class="btn small ghost" data-del-set="${i}">− Set</button>
        <button class="btn small ghost" data-add-set="${i}">＋ Set</button>
      </div>
    </div>
  </div>`;
}

// Bottom sheet listing all exercises, with search. Calls onPick(exercise).
export function pickExercise(store, onPick, { title = 'Add exercise' } = {}) {
  const list = Object.values(store.program.exercises).filter(x => !x.archived).sort((a, b) => a.name.localeCompare(b.name));
  openSheet(`
    <h2>${esc(title)}</h2>
    <input class="search" placeholder="Search…" data-q>
    <div class="pick-list">
      ${list.map(x => `<button class="pick-row" data-pick="${esc(x.id)}"><span>${esc(x.name)}</span><span class="muted small">${esc(x.primary.join(', '))}</span></button>`).join('')}
    </div>
    <p class="muted small">New exercises are created on the Program page.</p>
  `, (sheet, close) => {
    $('[data-q]', sheet).addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      $$('[data-pick]', sheet).forEach(b => { b.hidden = !b.textContent.toLowerCase().includes(q); });
    });
    sheet.addEventListener('click', e => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      close();
      onPick(store.program.exercises[b.dataset.pick]);
    });
  });
}
