// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';
import { seedProgram } from '../js/seed.js';

test('weeks start on Sunday', () => {
  assert.equal(C.weekStart('2026-10-11'), '2026-10-11'); // Sunday
  assert.equal(C.weekStart('2026-10-13'), '2026-10-11'); // Tuesday
  assert.equal(C.weekStart('2026-10-17'), '2026-10-11'); // Saturday
  assert.equal(C.weekStart('2026-10-18'), '2026-10-18');
  assert.equal(C.weekStart('2027-01-01'), '2026-12-27'); // across a year
  assert.equal(C.addDays('2028-02-28', 1), '2028-02-29'); // leap year
});

test('planned volume matches the table on page 7 of the plan', () => {
  const p = seedProgram();
  const fourDay = C.plannedVolume(p, ['upper-a', 'legs-1', 'upper-b', 'upper-c']);
  const expected4 = {
    Chest: 13, Biceps: 13, Triceps: 13, Forearms: 13.5, Back: 12, 'Side delts': 11.5,
    'Rear delts': 8, 'Front delts': 7.5, Quads: 8, Glutes: 7.5, Hamstrings: 7, Calves: 7, Abs: 7,
  };
  assert.deepEqual(fourDay, expected4);
  const fiveDay = C.plannedVolume(p);
  assert.deepEqual(fiveDay, { ...expected4, Quads: 14, Glutes: 15.5, Hamstrings: 13, Calves: 11, Abs: 10 });
  // set totals per day from the plan
  const daySets = Object.fromEntries(p.days.map(d => [d.id, d.slots.reduce((s, x) => s + x.sets, 0)]));
  assert.deepEqual(daySets, { 'upper-a': 20, 'legs-1': 26, 'upper-b': 23, 'upper-c': 20, 'legs-2': 21 });
  assert.equal(Object.keys(p.exercises).length, 34);
});

function entry(exId, primary, secondary, sets) {
  return { exId, name: exId, primary, secondary, sets: sets.map(([w, r, done = true]) => ({ w, r, done })) };
}

const sessions = [
  { id: 's1', date: '2026-10-11', dayName: 'Upper A', entries: [
    entry('bench', ['Chest'], ['Triceps', 'Front delts'], [[24, 10], [24, 9], [24, 8], [24, 12, false]]),
    entry('row', ['Back'], ['Biceps'], [[50, 10], [50, null], [0, 0]]),
  ] },
  { id: 's2', date: '2026-10-13', dayName: 'Upper B', entries: [
    entry('leg-raise', ['Abs'], [], [[0, 12], [0, 10]]),
    entry('bench', ['Chest'], ['Triceps', 'Front delts'], [[26, 8]]),
  ] },
  { id: 's3', date: '2026-10-19', dayName: 'Upper A', entries: [
    entry('bench', ['Chest'], ['Triceps', 'Front delts'], [[26, 10], [26, 9]]),
  ] },
];

test('only ticked sets with reps count', () => {
  assert.equal(C.countedSets(sessions[0].entries[0]).length, 3);
  assert.equal(C.countedSets(sessions[0].entries[1]).length, 1); // null reps and 0 reps ignored
  assert.deepEqual(C.sessionStats(sessions[0]), { sets: 4, tonnage: 24 * 27 + 500 });
});

test('muscle volume: primary full, secondary half, bodyweight counts sets with 0 kg', () => {
  const week = C.sessionsInWeek(sessions, '2026-10-11');
  assert.equal(week.length, 2);
  const v = C.muscleVolume(week);
  assert.equal(v.Chest.sets, 4);
  assert.equal(v.Chest.tonnage, 24 * 27 + 26 * 8);
  assert.equal(v.Triceps.sets, 2);
  assert.equal(v.Triceps.tonnage, (24 * 27 + 26 * 8) / 2);
  assert.equal(v.Back.sets, 1);
  assert.equal(v.Biceps.sets, 0.5);
  assert.equal(v.Abs.sets, 2);
  assert.equal(v.Abs.tonnage, 0);
});

test('weekly series fills empty weeks with 0', () => {
  const extra = [...sessions, { id: 's4', date: '2026-11-03', entries: [entry('bench', ['Chest'], [], [[30, 5]])] }];
  const series = C.weeklySeries(extra, { muscle: 'Chest', metric: 'sets' });
  assert.deepEqual(series.map(x => x.week), ['2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01']);
  assert.deepEqual(series.map(x => x.value), [4, 2, 0, 1]);
  const total = C.weeklySeries(sessions, { metric: 'sets', untilWeek: '2026-10-25' });
  assert.deepEqual(total.map(x => x.value), [7, 2, 0]);
});

test('records and last performance per exercise', () => {
  const r = C.exerciseRecords(sessions, 'bench');
  assert.deepEqual(r.heaviest, { w: 26, r: 10, date: '2026-10-19' });
  assert.deepEqual(r.bestTonnage, { tonnage: 648, date: '2026-10-11' });
  assert.equal(r.sessions, 3);
  const last = C.lastPerformance(sessions, 'bench', 's3');
  assert.equal(last.date, '2026-10-13');
  assert.deepEqual(last.sets, [{ w: 26, r: 8 }]);
  assert.equal(C.exerciseRecords(sessions, 'nothing'), null);
});

test('backup round trip and validation', () => {
  const program = seedProgram();
  const b = C.makeBackup({ program, settings: { targetMin: 10 }, sessions });
  const parsed = JSON.parse(JSON.stringify(b));
  assert.equal(C.validateBackup(parsed), true);
  assert.equal(parsed.sessions.length, 3);
  assert.throws(() => C.validateBackup({ app: 'other' }), /not exported from this app/);
  assert.throws(() => C.validateBackup({ ...parsed, sessions: [{ id: 'x', date: 'bad', entries: [] }] }), /session x/);
  assert.throws(() => C.validateBackup({ ...parsed, version: 99 }), /version/);
});

test('CSV has one row per counted set', () => {
  const csv = C.toCSV(sessions).split('\n');
  assert.equal(csv.length, 1 + 4 + 3 + 2);
  assert.equal(csv[1], '2026-10-11,2026-10-11,Upper A,bench,Chest,Triceps | Front delts,1,24,10,240');
});
