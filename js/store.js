// Data layer. The rest of the app only talks to this file.
//
// Firestore layout (one folder per user, so more users can be added later):
//   users/{uid}/meta/program    -> { exercises, days }
//   users/{uid}/meta/settings   -> { targetMin, targetMax, deloadWeeks, lastExportAt, accent }
//   users/{uid}/meta/profile    -> { avatar }   (small JPEG as a data URL)
//   users/{uid}/sessions/{id}   -> one workout
//
// Firestore keeps a copy on the phone, so everything works offline and syncs later.
// Writes are never awaited by the UI: offline, Firestore only confirms them once back online.

import { seedProgram, defaultSettings } from './seed.js';
import { validateBackup } from './calc.js';

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const clone = o => JSON.parse(JSON.stringify(o));

class BaseStore {
  constructor() {
    this.program = null;
    this.settings = defaultSettings();
    this.profile = {};
    this.sessions = new Map();
    this.pending = false;
    this.ready = false;
    this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }
  sessionList() { return [...this.sessions.values()].sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || ''))); }
  getSession(id) { return this.sessions.get(id); }

  saveSession(session) {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, clone(session));
    this.emit();
    this._writeSession(clone(session));
  }
  deleteSession(id) {
    this.sessions.delete(id);
    this.emit();
    this._deleteSession(id);
  }
  saveProgram(program) {
    this.program = clone(program);
    this.emit();
    this._writeMeta('program', clone(program));
  }
  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this.emit();
    this._writeMeta('settings', clone(this.settings));
  }
  saveProfile(patch) {
    this.profile = { ...this.profile, ...patch };
    this.emit();
    this._writeMeta('profile', clone(this.profile));
  }

  // Replace everything with a backup file. Validates first, so a bad file changes nothing.
  async replaceAll(backup) {
    validateBackup(backup);
    const old = [...this.sessions.keys()];
    const incoming = new Map(backup.sessions.map(s => [s.id, s]));
    this.program = clone(backup.program);
    this.settings = { ...defaultSettings(), ...(backup.settings || {}) };
    this.sessions = new Map([...incoming].map(([k, v]) => [k, clone(v)]));
    this.emit();
    await this._replaceAll(this.program, this.settings, [...incoming.values()], old.filter(id => !incoming.has(id)));
  }
}

// ---------------------------------------------------------------------------
// Firebase store (the real one)
// ---------------------------------------------------------------------------

export class FirebaseStore extends BaseStore {
  constructor(fs, db, uid) {
    super();
    this.fs = fs; // the firestore module
    this.db = db;
    this.uid = uid;
    this.unsubs = [];
    this.pendingParts = {};
  }

  ref(...path) { return this.fs.doc(this.db, 'users', this.uid, ...path); }

  async start() {
    const { onSnapshot, collection, getDocFromServer, setDoc } = this.fs;
    const markPending = (key, snap) => {
      this.pendingParts[key] = snap.metadata.hasPendingWrites;
      this.pending = Object.values(this.pendingParts).some(Boolean);
    };

    // Seed the program only when the SERVER says this user has none.
    // (A cache miss on a new phone must never overwrite real data.)
    // If the server can't be reached yet, keep retrying every few seconds.
    let checking = false;
    const checkSeed = async () => {
      if (checking || this.program || this.stopped) return;
      checking = true;
      try {
        const server = await getDocFromServer(this.ref('meta', 'program'));
        if (!server.exists() && !this.program) {
          this.program = seedProgram();
          setDoc(this.ref('meta', 'program'), this.program).catch(this._catch);
        }
        this.lastError = null;
      } catch (e) {
        console.warn('Could not reach the database yet', e);
        this.lastError = /does not exist|not-found/i.test(e.message || '') ? 'The Firestore database does not exist yet. Create it in Firebase → Firestore Database.'
          : e.code === 'permission-denied' ? 'Firestore refused access. Paste the security rules in Firebase → Firestore → Rules (see README).'
          : navigator.onLine ? 'Cannot reach the database yet. Retrying… (' + (e.code || e.message) + ')'
          : 'No internet. The first sign-in on a device needs internet once.';
        this.retryTimer = setTimeout(checkSeed, 5000);
      }
      checking = false;
      this._checkReady();
      this.emit();
    };
    this.unsubs.push(onSnapshot(this.ref('meta', 'program'), { includeMetadataChanges: true }, snap => {
      markPending('program', snap);
      if (snap.exists()) {
        this.program = snap.data();
        this.lastError = null;
      } else {
        checkSeed();
      }
      this._checkReady();
      this.emit();
    }, e => this._error(e)));

    this.unsubs.push(onSnapshot(this.ref('meta', 'settings'), { includeMetadataChanges: true }, snap => {
      markPending('settings', snap);
      if (snap.exists()) this.settings = { ...defaultSettings(), ...snap.data() };
      this.emit();
    }, e => this._error(e)));

    this.unsubs.push(onSnapshot(this.ref('meta', 'profile'), { includeMetadataChanges: true }, snap => {
      markPending('profile', snap);
      this.profile = snap.exists() ? snap.data() : {};
      this.emit();
    }, e => this._error(e)));

    this.unsubs.push(onSnapshot(collection(this.db, 'users', this.uid, 'sessions'), { includeMetadataChanges: true }, snap => {
      markPending('sessions', snap);
      const next = new Map();
      snap.forEach(d => next.set(d.id, d.data()));
      this.sessions = next;
      this.sessionsLoaded = true;
      this._checkReady();
      this.emit();
    }, e => this._error(e)));
  }

  _checkReady() {
    if (!this.ready && this.program && this.sessionsLoaded) { this.ready = true; }
  }
  _error(e) {
    console.error(e);
    this.lastError = e.code === 'permission-denied'
      ? 'Firestore refused access. Check the security rules (see README).'
      : (e.message || String(e));
    this.emit();
  }
  _catch = e => this._error(e);

  _writeSession(s) { this.fs.setDoc(this.ref('sessions', s.id), s).catch(this._catch); }
  _deleteSession(id) { this.fs.deleteDoc(this.ref('sessions', id)).catch(this._catch); }
  _writeMeta(name, data) { this.fs.setDoc(this.ref('meta', name), data).catch(this._catch); }

  async _replaceAll(program, settings, sessions, removeIds) {
    const { writeBatch } = this.fs;
    const ops = [
      b => b.set(this.ref('meta', 'program'), program),
      b => b.set(this.ref('meta', 'settings'), settings),
      ...sessions.map(s => b => b.set(this.ref('sessions', s.id), s)),
      ...removeIds.map(id => b => b.delete(this.ref('sessions', id))),
    ];
    // Firestore batches hold at most 500 writes.
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(this.db);
      ops.slice(i, i + 450).forEach(op => op(batch));
      batch.commit().catch(this._catch);
    }
  }

  stop() { this.stopped = true; clearTimeout(this.retryTimer); this.unsubs.forEach(u => u()); this.unsubs = []; }
}

// ---------------------------------------------------------------------------
// Local store: used only when Firebase is not configured yet (demo / testing).
// Data stays in this browser only.
// ---------------------------------------------------------------------------

const LS_KEY = 'gym-tracker-local-v1';

export class LocalStore extends BaseStore {
  async start() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(LS_KEY)); } catch { /* empty */ }
    this.program = data?.program || seedProgram();
    this.settings = { ...defaultSettings(), ...(data?.settings || {}) };
    this.profile = data?.profile || {};
    this.sessions = new Map((data?.sessions || []).map(s => [s.id, s]));
    this.ready = true;
    this._persist();
    this.emit();
  }
  _persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        program: this.program, settings: this.settings, profile: this.profile, sessions: [...this.sessions.values()],
      }));
    } catch (e) { this.lastError = 'Could not save in this browser: ' + e.message; }
  }
  _writeSession() { this._persist(); }
  _deleteSession() { this._persist(); }
  _writeMeta() { this._persist(); }
  async _replaceAll() { this._persist(); }
  stop() {}
}
