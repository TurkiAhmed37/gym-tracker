// All the math lives here: dates, weeks, volume, records.
// No browser or Firebase code, so it can be tested on its own (see tests/calc.test.mjs).

// ---------- dates (always 'YYYY-MM-DD' strings, weeks start on Sunday) ----------

export function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = parse(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

export function weekStart(dateStr) {
  const d = parse(dateStr);
  return addDays(dateStr, -d.getUTCDay()); // getUTCDay: 0 = Sunday
}

export function weekLabel(weekKey) {
  const end = addDays(weekKey, 6);
  return `${shortDate(weekKey)} – ${shortDate(end)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
export function longDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parse(dateStr).getUTCDay()];
  return `${wd} ${d} ${MONTHS[m - 1]} ${y}`;
}

// ---------- sets ----------

// A set counts when it is ticked and has at least one rep. Weight may be 0 (bodyweight).
export function isCounted(set) {
  return !!set && set.done === true && Number(set.r) > 0;
}

export function countedSets(entry) {
  return (entry.sets || []).filter(isCounted);
}

export function entryTonnage(entry) {
  return countedSets(entry).reduce((sum, s) => sum + (Number(s.w) || 0) * Number(s.r), 0);
}

export function sessionStats(session) {
  let sets = 0, tonnage = 0;
  for (const e of session.entries || []) {
    sets += countedSets(e).length;
    tonnage += entryTonnage(e);
  }
  return { sets, tonnage };
}

// ---------- volume per muscle ----------
// Primary muscle: 1 set and the full tonnage. Secondary muscle: half a set and half the tonnage.
// This is the "counted sets" rule from the training plan (direct + half of indirect).

export const SECONDARY_WEIGHT = 0.5;

function addMuscle(out, muscle, sets, tonnage) {
  if (!out[muscle]) out[muscle] = { sets: 0, tonnage: 0 };
  out[muscle].sets += sets;
  out[muscle].tonnage += tonnage;
}

export function muscleVolume(sessions) {
  const out = {};
  for (const s of sessions) {
    for (const e of s.entries || []) {
      const n = countedSets(e).length;
      if (!n) continue;
      const t = entryTonnage(e);
      for (const m of e.primary || []) addMuscle(out, m, n, t);
      for (const m of e.secondary || []) addMuscle(out, m, n * SECONDARY_WEIGHT, t * SECONDARY_WEIGHT);
    }
  }
  return out;
}

// Weekly volume the program asks for, if every set is done. dayIds = which days to include.
export function plannedVolume(program, dayIds) {
  const out = {};
  for (const day of program.days) {
    if (dayIds && !dayIds.includes(day.id)) continue;
    for (const slot of day.slots) {
      const ex = program.exercises[slot.exId];
      if (!ex) continue;
      for (const m of ex.primary) addMuscle(out, m, slot.sets, 0);
      for (const m of ex.secondary) addMuscle(out, m, slot.sets * SECONDARY_WEIGHT, 0);
    }
  }
  const sets = {};
  for (const m in out) sets[m] = out[m].sets;
  return sets;
}

export function sessionsInWeek(sessions, weekKey) {
  const end = addDays(weekKey, 6);
  return sessions.filter(s => s.date >= weekKey && s.date <= end);
}

// One value per week, from the first week with data to `untilWeek`, with empty weeks as 0.
// metric: 'sets' | 'tonnage'. muscle: a muscle name, or null for the total of all sets/tonnage.
export function weeklySeries(sessions, { muscle = null, metric = 'sets', untilWeek } = {}) {
  if (!sessions.length) return [];
  const byWeek = new Map();
  for (const s of sessions) {
    const wk = weekStart(s.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(s);
  }
  const weeks = [...byWeek.keys()].sort();
  const last = untilWeek && untilWeek > weeks[weeks.length - 1] ? untilWeek : weeks[weeks.length - 1];
  const out = [];
  for (let wk = weeks[0]; wk <= last; wk = addDays(wk, 7)) {
    const list = byWeek.get(wk) || [];
    let value;
    if (muscle) {
      const v = muscleVolume(list)[muscle];
      value = v ? v[metric] : 0;
    } else {
      value = list.reduce((sum, s) => sum + sessionStats(s)[metric], 0);
    }
    out.push({ week: wk, value });
  }
  return out;
}

// ---------- per exercise ----------

function sortByDate(sessions) {
  return [...sessions].sort((a, b) => (a.date + (a.createdAt || '')).localeCompare(b.date + (b.createdAt || '')));
}

// Every session where this exercise has at least one counted set, oldest first.
export function exerciseHistory(sessions, exId) {
  const out = [];
  for (const s of sortByDate(sessions)) {
    for (const e of s.entries || []) {
      if (e.exId !== exId) continue;
      const sets = countedSets(e);
      if (!sets.length) continue;
      out.push({
        date: s.date, sessionId: s.id,
        sets: sets.map(x => ({ w: Number(x.w) || 0, r: Number(x.r) })),
        topWeight: Math.max(...sets.map(x => Number(x.w) || 0)),
        tonnage: entryTonnage(e),
      });
    }
  }
  return out;
}

export function exerciseRecords(sessions, exId) {
  const hist = exerciseHistory(sessions, exId);
  if (!hist.length) return null;
  let heaviest = null, bestTonnage = null, mostReps = null;
  for (const h of hist) {
    for (const s of h.sets) {
      if (!heaviest || s.w > heaviest.w || (s.w === heaviest.w && s.r > heaviest.r)) heaviest = { ...s, date: h.date };
      if (!mostReps || s.r > mostReps.r || (s.r === mostReps.r && s.w > mostReps.w)) mostReps = { ...s, date: h.date };
    }
    if (!bestTonnage || h.tonnage > bestTonnage.tonnage) bestTonnage = { tonnage: h.tonnage, date: h.date };
  }
  return { heaviest, bestTonnage, mostReps, sessions: hist.length };
}

// The most recent time this exercise was done, ignoring one session (the one being logged now).
export function lastPerformance(sessions, exId, excludeSessionId) {
  const hist = exerciseHistory(sessions.filter(s => s.id !== excludeSessionId), exId);
  return hist.length ? hist[hist.length - 1] : null;
}

// ---------- numbers ----------

export function fmtNum(n, digits = 1) {
  if (n == null || isNaN(n)) return '–';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function fmtKg(n) {
  if (n >= 10000) return `${fmtNum(n / 1000, 1)}t`;
  return `${fmtNum(n, 0)} kg`;
}

// ---------- backup ----------

export const BACKUP_VERSION = 1;

export function makeBackup({ program, settings, sessions }) {
  return {
    app: 'gym-tracker', version: BACKUP_VERSION, exportedAt: new Date().toISOString(),
    program, settings, sessions: sortByDate(sessions),
  };
}

// Throws an Error with a readable message if the file is not a valid backup.
export function validateBackup(data) {
  const fail = msg => { throw new Error(`Not a valid backup: ${msg}`); };
  if (!data || typeof data !== 'object') fail('file is not JSON data');
  if (data.app !== 'gym-tracker') fail('it was not exported from this app');
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) fail('unknown backup version');
  const p = data.program;
  if (!p || typeof p.exercises !== 'object' || !Array.isArray(p.days)) fail('program is missing');
  for (const d of p.days) {
    if (!d.id || !d.name || !Array.isArray(d.slots)) fail(`day "${d.name || d.id}" is broken`);
  }
  if (!Array.isArray(data.sessions)) fail('sessions are missing');
  for (const s of data.sessions) {
    if (!s.id || !/^\d{4}-\d{2}-\d{2}$/.test(s.date || '') || !Array.isArray(s.entries)) fail(`session ${s.id || '?'} is broken`);
  }
  return true;
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per counted set. Opens in Excel / Google Sheets.
export function toCSV(sessions) {
  const rows = [['date', 'week_start', 'day', 'exercise', 'primary_muscles', 'secondary_muscles', 'set', 'weight_kg', 'reps', 'tonnage_kg']];
  for (const s of sortByDate(sessions)) {
    for (const e of s.entries || []) {
      countedSets(e).forEach((set, i) => {
        const w = Number(set.w) || 0, r = Number(set.r);
        rows.push([s.date, weekStart(s.date), s.dayName || '', e.name, (e.primary || []).join(' | '), (e.secondary || []).join(' | '), i + 1, w, r, w * r]);
      });
    }
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}
