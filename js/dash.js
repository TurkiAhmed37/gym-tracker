// Dashboard: weekly volume per muscle, per day, per exercise, and trends over all weeks.

import * as C from './calc.js';
import { MUSCLES } from './seed.js';
import { esc, $, $$, hBars, columnChart, lineChart, autoscroll } from './ui.js';
import { sessionRow } from './log.js';

// view state survives re-renders (not saved)
const view = { week: null, metric: 'sets', trendMuscle: '', trendMetric: 'sets', exId: '' };

export function renderDashboard(ctx) {
  const { store } = ctx;
  const all = store.sessionList();
  const settings = store.settings;
  const band = [settings.targetMin, settings.targetMax];
  const deloads = new Set(settings.deloadWeeks || []);
  const currentWeek = C.weekStart(C.todayStr());
  if (!view.week) view.week = currentWeek;
  const wk = view.week;
  const isDeload = deloads.has(wk);

  const week = C.sessionsInWeek(all, wk);
  const vol = C.muscleVolume(week);
  const totals = week.reduce((a, s) => { const st = C.sessionStats(s); a.sets += st.sets; a.tonnage += st.tonnage; return a; }, { sets: 0, tonnage: 0 });

  // all muscles, including any custom ones that show up in logged data
  const muscles = [...new Set([...MUSCLES, ...Object.keys(vol)])];
  const metric = view.metric;
  const rows = muscles.map(m => ({ label: m, value: vol[m]?.[metric] || 0 }))
    .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
  const below = metric === 'sets' ? rows.filter(r => r.value < band[0]).length : 0;

  // trend
  const series = C.weeklySeries(all, { muscle: view.trendMuscle || null, metric: view.trendMetric, untilWeek: currentWeek });
  const trendPts = series.map((p, i) => ({
    x: C.shortDate(p.week), key: p.week, value: p.value, mark: deloads.has(p.week),
    title: `Week of ${C.shortDate(p.week)}${deloads.has(p.week) ? ' (deload)' : ''}`,
    showLabel: i % 4 === 0 || i === series.length - 1,
  }));
  const trendBand = view.trendMuscle && view.trendMetric === 'sets' ? band : null;

  // exercise progress
  const exIds = new Set();
  for (const s of all) for (const e of s.entries || []) if (C.countedSets(e).length) exIds.add(e.exId);
  const exNames = {};
  for (const s of all) for (const e of s.entries || []) exNames[e.exId] = store.program.exercises[e.exId]?.name || e.name;
  const exOptions = [...exIds].sort((a, b) => exNames[a].localeCompare(exNames[b]));
  if (!view.exId || !exIds.has(view.exId)) {
    // default: first exercise of the most recent workout
    const recent = all.find(s => (s.entries || []).some(e => C.countedSets(e).length));
    view.exId = recent ? recent.entries.find(e => C.countedSets(e).length).exId : (exOptions[0] || '');
  }
  const hist = view.exId ? C.exerciseHistory(all, view.exId) : [];
  const rec = view.exId ? C.exerciseRecords(all, view.exId) : null;

  const fmtMetric = v => metric === 'sets' ? C.fmtNum(v) : C.fmtKg(v);
  const fmtTrend = v => view.trendMetric === 'sets' ? C.fmtNum(v) : (v >= 1000 ? `${C.fmtNum(v / 1000)}t` : C.fmtNum(v, 0));

  const html = `
    <div class="week-nav">
      <button class="icon-btn" data-week="-7" aria-label="Previous week">‹</button>
      <div class="center">
        <div class="title">${wk === currentWeek ? 'This week' : 'Week of ' + C.shortDate(wk)}</div>
        <div class="muted small">${C.weekLabel(wk)}</div>
      </div>
      <button class="icon-btn" data-week="7" aria-label="Next week" ${wk >= currentWeek ? 'disabled' : ''}>›</button>
    </div>
    <label class="deload-toggle ${isDeload ? 'on' : ''}">
      <input type="checkbox" data-deload ${isDeload ? 'checked' : ''}> Deload week
      <span class="muted small">${isDeload ? 'marked on charts' : 'tap to mark'}</span>
    </label>

    <div class="stats">
      <div class="stat"><div class="big">${week.length}</div><div class="muted small">workouts</div></div>
      <div class="stat"><div class="big">${totals.sets}</div><div class="muted small">sets</div></div>
      <div class="stat"><div class="big">${totals.tonnage >= 100000 ? C.fmtNum(totals.tonnage / 1000) + "t" : C.fmtNum(totals.tonnage, 0)}</div><div class="muted small">kg volume</div></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Per muscle</h3>
        <div class="seg" role="group">
          <button data-metric="sets" class="${metric === 'sets' ? 'on' : ''}">Sets</button>
          <button data-metric="tonnage" class="${metric === 'tonnage' ? 'on' : ''}">kg</button>
        </div>
      </div>
      ${metric === 'sets' ? `<p class="muted small">Target ${band[0]}–${band[1]} counted sets per muscle (shaded). Helper muscles count ½. ${below ? `<b>${below} below target.</b>` : week.length ? 'All on target.' : ''}</p>`
        : `<p class="muted small">Weight × reps. Helper muscles get half.</p>`}
      ${hBars(rows, { band: metric === 'sets' ? band : null, format: fmtMetric })}
    </div>

    <div class="card">
      <h3>Per day</h3>
      ${week.length ? `<div class="list">${week.slice().sort((a, b) => a.date.localeCompare(b.date)).map(sessionRow).join('')}</div>` : `<p class="muted small">No workouts this week.</p>`}
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Weekly trend</h3>
        <div class="seg" role="group">
          <button data-tmetric="sets" class="${view.trendMetric === 'sets' ? 'on' : ''}">Sets</button>
          <button data-tmetric="tonnage" class="${view.trendMetric === 'tonnage' ? 'on' : ''}">kg</button>
        </div>
      </div>
      <select data-tmuscle aria-label="Muscle">
        <option value="">All muscles (total)</option>
        ${muscles.map(m => `<option ${m === view.trendMuscle ? 'selected' : ''}>${esc(m)}</option>`).join('')}
      </select>
      ${columnChart(trendPts, { band: trendBand, format: fmtTrend, onTapAttr: 'data-goweek' })}
      <p class="muted small">Tap a bar to open that week. ${deloads.size ? 'Striped = deload week.' : ''}</p>
    </div>

    <div class="card">
      <h3>Exercise progress</h3>
      ${exOptions.length ? `
        <select data-ex aria-label="Exercise">
          ${exOptions.map(id => `<option value="${esc(id)}" ${id === view.exId ? 'selected' : ''}>${esc(exNames[id])}</option>`).join('')}
        </select>
        ${rec ? `<div class="records">
          <div><div class="muted small">Heaviest</div><b>${C.fmtNum(rec.heaviest.w)} kg × ${rec.heaviest.r}</b><div class="muted small">${C.shortDate(rec.heaviest.date)}</div></div>
          <div><div class="muted small">Best volume</div><b>${C.fmtKg(rec.bestTonnage.tonnage)}</b><div class="muted small">${C.shortDate(rec.bestTonnage.date)}</div></div>
          <div><div class="muted small">Sessions</div><b>${rec.sessions}</b></div>
        </div>` : ''}
        <div class="muted small chart-title">Top weight (kg)</div>
        ${lineChart(hist.map(h => ({ x: C.shortDate(h.date), value: h.topWeight })), { format: v => C.fmtNum(v) })}
        <div class="muted small chart-title">Volume per session (kg)</div>
        ${lineChart(hist.map(h => ({ x: C.shortDate(h.date), value: h.tonnage })), { format: v => C.fmtNum(v, 0) })}
      ` : `<p class="muted small">Log a workout to see progress here.</p>`}
    </div>
  `;

  return {
    html,
    mount(root) {
      autoscroll(root);
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-week],[data-metric],[data-tmetric],[data-goweek]');
        if (!b) return;
        if (b.dataset.week) view.week = C.addDays(view.week, +b.dataset.week);
        if (b.dataset.metric) view.metric = b.dataset.metric;
        if (b.dataset.tmetric) view.trendMetric = b.dataset.tmetric;
        if (b.dataset.goweek) { view.week = b.dataset.goweek; window.scrollTo(0, 0); }
        ctx.render();
      });
      $('[data-deload]', root).addEventListener('change', e => {
        const set = new Set(store.settings.deloadWeeks || []);
        e.target.checked ? set.add(wk) : set.delete(wk);
        store.saveSettings({ deloadWeeks: [...set].sort() });
      });
      $('[data-tmuscle]', root).addEventListener('change', e => { view.trendMuscle = e.target.value; ctx.render(); });
      $('[data-ex]', root)?.addEventListener('change', e => { view.exId = e.target.value; ctx.render(); });
    },
  };
}

export function renderHistory(ctx) {
  const { store } = ctx;
  const all = store.sessionList();
  const deloads = new Set(store.settings.deloadWeeks || []);
  const groups = new Map();
  for (const s of all) {
    const wk = C.weekStart(s.date);
    if (!groups.has(wk)) groups.set(wk, []);
    groups.get(wk).push(s);
  }
  const html = all.length ? [...groups].map(([wk, list]) => {
    const sets = list.reduce((a, s) => a + C.sessionStats(s).sets, 0);
    return `<h2 class="section">${C.weekLabel(wk)} ${deloads.has(wk) ? '<span class="tag">deload</span>' : ''}
      <span class="muted small">${list.length} workouts · ${sets} sets</span></h2>
      <div class="card list">${list.map(sessionRow).join('')}</div>`;
  }).join('') : `<p class="muted">No workouts logged yet. Start one from the Log tab.</p>`;
  return { html };
}
