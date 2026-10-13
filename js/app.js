// App start-up: sign-in, page routing, header and bottom bar.

import { firebaseConfig } from '../firebase-config.js';
import { FirebaseStore, LocalStore } from './store.js';
import { esc, $, toast } from './ui.js';
import { renderLogHome, renderSession } from './log.js';
import { renderDashboard, renderHistory } from './dash.js';
import { renderProgram } from './program.js';
import { renderSettings, ACCENTS } from './settings.js';

const PAGES = {
  log: { title: 'Log', icon: '✚' },
  dash: { title: 'Dashboard', icon: '▤' },
  history: { title: 'History', icon: '☰' },
  program: { title: 'Program', icon: '✎' },
  settings: { title: 'Settings', icon: '⚙' },
};

const ctx = {
  store: null, user: null, mode: firebaseConfig ? 'firebase' : 'local',
  go(hash) { if (location.hash === hash) ctx.render(); else location.hash = hash; },
  render: () => render(),
  signOut: () => {},
};
window.__gym = ctx; // handy for debugging from the browser console

const app = $('#app');

// ---------- rendering ----------

let pendingRender = false;
// fromStore = redraw requested because data changed (not by a tap on this page).
function render(fromStore = false) {
  // The workout page keeps its own copy while you log, so data updates don't redraw it under your fingers.
  if (fromStore && ctx.store?.ready && /^#\/log\/./.test(location.hash) && app.dataset.page === location.hash
      && ctx.store.getSession(location.hash.split('/')[2])) {
    updateSyncBadge();
    return;
  }
  // Don't redraw while typing in a field (it would lose the cursor). Redraw when the field is left.
  const active = document.activeElement;
  if (active && active.matches('#view input, #view select') && active.type !== 'checkbox' && active.type !== 'file') {
    pendingRender = true;
    return;
  }
  pendingRender = false;
  const { store } = ctx;
  if (!store || !store.ready) { app.innerHTML = loadingScreen(store?.lastError); return; }

  document.documentElement.style.setProperty('--accent', ACCENTS[store.settings.accent] || ACCENTS.blue);

  const [page = 'log', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const key = PAGES[page] ? page : 'log';
  let view;
  if (key === 'log' && arg) view = renderSession(ctx, arg);
  else if (key === 'log') view = renderLogHome(ctx);
  else if (key === 'dash') view = renderDashboard(ctx);
  else if (key === 'history') view = renderHistory(ctx);
  else if (key === 'program') view = renderProgram(ctx);
  else view = renderSettings(ctx);

  const avatar = store.profile.avatar || ctx.user?.photoURL || '';
  const firstName = (ctx.user?.displayName || '').split(' ')[0];
  const sync = syncState();

  const scrollY = window.scrollY;
  const samePage = app.dataset.page === location.hash;
  app.dataset.page = location.hash;
  app.innerHTML = `
    <header class="top">
      <a class="avatar" href="#/settings" aria-label="Settings">${avatar ? `<img src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : '🏋️'}</a>
      <div class="top-title">
        <div class="h1">${key === 'log' && !arg ? (firstName ? `Hi ${esc(firstName)}` : 'Log') : PAGES[key].title}</div>
        <div class="sync ${sync[0]}"><span class="dot"></span>${sync[1]}</div>
      </div>
      ${key === 'log' && arg ? `<a class="btn small ghost" href="#/log">Close</a>` : ''}
    </header>
    ${store.lastError ? `<div class="banner error">${esc(store.lastError)}</div>` : ''}
    <main id="view">${view.html}</main>
    <nav class="tabs">
      ${Object.entries(PAGES).map(([k, p]) => `<a href="#/${k}" class="${k === key ? 'on' : ''}"><span class="ic">${p.icon}</span><span>${p.title}</span></a>`).join('')}
    </nav>`;
  view.mount?.($('#view'));
  if (samePage) window.scrollTo(0, scrollY);
}

document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) render(true); }, 300));
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
window.addEventListener('online', updateSyncBadge);
window.addEventListener('offline', updateSyncBadge);

function updateSyncBadge() {
  const el = $('.sync');
  if (!el) return;
  const [cls, text] = syncState();
  el.className = 'sync ' + cls;
  el.innerHTML = `<span class="dot"></span>${text}`;
}

function syncState() {
  if (!navigator.onLine) return ['offline', 'Offline · saved on phone'];
  if (ctx.store?.pending) return ['pending', 'Syncing…'];
  return ['ok', ctx.mode === 'local' ? 'Demo mode' : 'Synced'];
}

function loadingScreen(err) {
  return `<div class="center-screen"><div class="logo">🏋️</div>
    ${err ? `<p class="warn-text">${esc(err)}</p>` : '<p class="muted">Loading your data…</p>'}</div>`;
}

function loginScreen(error = '') {
  app.innerHTML = `<div class="center-screen">
    <div class="logo">🏋️</div>
    <h1>Gym Tracker</h1>
    <p class="muted">Log your sets. See your volume.</p>
    <button class="btn primary big-btn" id="signin">Sign in with Google</button>
    ${error ? `<p class="warn-text small">${esc(error)}</p>` : ''}
    <p class="muted small">Your data is private to your Google account.</p>
  </div>`;
}

// ---------- start ----------

async function startLocal() {
  ctx.store = new LocalStore();
  ctx.store.onChange(() => render(true));
  await ctx.store.start();
  render();
}

async function startFirebase() {
  const v = '../vendor/firebase/'; // relative to this file (js/)
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(v + 'firebase-app.js'), import(v + 'firebase-auth.js'), import(v + 'firebase-firestore.js'),
  ]);
  const fbApp = initializeApp(firebaseConfig);
  const db = fs.initializeFirestore(fbApp, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const auth = authMod.getAuth(fbApp);
  if (window.__gymEmulator) { // only used by automated tests
    authMod.connectAuthEmulator(auth, window.__gymEmulator.auth, { disableWarnings: true });
    fs.connectFirestoreEmulator(db, ...window.__gymEmulator.firestore);
    window.__gymTest = { auth, authMod, fs, db };
  }
  ctx.signOut = () => authMod.signOut(auth);

  authMod.getRedirectResult(auth).catch(e => loginScreen(friendlyAuthError(e)));

  document.addEventListener('click', async e => {
    if (!e.target.closest('#signin')) return;
    const provider = new authMod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await authMod.signInWithPopup(auth, provider);
    } catch (err) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(err.code)) {
        authMod.signInWithRedirect(auth, provider);
      } else if (err.code !== 'auth/popup-closed-by-user') {
        loginScreen(friendlyAuthError(err));
      }
    }
  });

  authMod.onAuthStateChanged(auth, async user => {
    ctx.store?.stop();
    ctx.user = user;
    if (!user) { ctx.store = null; loginScreen(); return; }
    ctx.store = new FirebaseStore(fs, db, user.uid);
    ctx.store.onChange(() => render(true));
    render();
    await ctx.store.start();
  });
}

function friendlyAuthError(e) {
  if (e?.code === 'auth/unauthorized-domain') return 'This website address is not allowed yet. Add it in Firebase → Authentication → Settings → Authorized domains.';
  if (e?.code === 'auth/network-request-failed') return 'No internet. Sign-in needs internet once; after that the app works offline.';
  return e?.message || String(e);
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW failed', e));
}

(ctx.mode === 'firebase' ? startFirebase() : startLocal()).catch(e => {
  console.error(e);
  app.innerHTML = loadingScreen('Could not start: ' + (e.message || e));
});

// Ask the browser not to clear our offline data (helps on iPhone when added to the home screen).
navigator.storage?.persist?.().catch(() => {});
void toast;
