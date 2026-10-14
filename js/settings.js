// Settings: photo and color, motivation, volume target, backup (export / import), account.

import * as C from './calc.js';
import { esc, $, toast, confirmSheet, resizeImage, download } from './ui.js';
import { resetProgram } from './program.js';

export const ACCENTS = {
  yellow: '#ffcc00', lime: '#c6ff3d', orange: '#ff7a1a', red: '#ff3b47', blue: '#3d8bff', purple: '#a66bff', teal: '#1fe0d0', green: '#2bd96b',
};

export function renderSettings(ctx) {
  const { store, user } = ctx;
  const s = store.settings;
  const avatar = store.profile.avatar || user?.photoURL || '';

  const html = `
    <div class="card">
      <h3>Look</h3>
      <div class="profile-row">
        <div class="avatar big-avatar">${avatar ? `<img src="${esc(avatar)}" alt="">` : '🏋️'}</div>
        <div class="col gap-s">
          <label class="btn small">Choose photo<input type="file" accept="image/*" data-photo hidden></label>
          ${store.profile.avatar ? `<button class="btn small ghost" data-rmphoto>Remove photo</button>` : ''}
        </div>
      </div>
      <div class="field"><span>Main color</span>
        <div class="swatches">${Object.entries(ACCENTS).map(([k, v]) =>
          `<button class="swatch ${s.accent === k ? 'on' : ''}" data-accent="${k}" style="background:${v}" aria-label="${k}"></button>`).join('')}</div>
      </div>
      
    </div>

    <div class="card">
      <h3>Motivation</h3>
      <p class="muted small">Shown at the top of the Log page. Leave empty to hide.</p>
      <label class="field"><span>Your goal</span><input type="text" data-goal maxlength="80" placeholder="e.g. Bench 100 kg by summer" value="${esc(s.goal || '')}"></label>
      <label class="field"><span>Motivation line</span><input type="text" data-quote maxlength="120" placeholder="e.g. Show up. Log it. Beat last week." value="${esc(s.quote || '')}"></label>
    </div>

    <div class="card">
      <h3>Volume target</h3>
      <p class="muted small">Weekly counted sets per muscle. Same target for every muscle.</p>
      <div class="grid2">
        <label class="field"><span>Minimum</span><input type="number" inputmode="numeric" data-tmin value="${s.targetMin}" min="0"></label>
        <label class="field"><span>Maximum</span><input type="number" inputmode="numeric" data-tmax value="${s.targetMax}" min="1"></label>
      </div>
    </div>

    <div class="card">
      <h3>Backup</h3>
      <p class="muted small">Your data is saved online in your Firebase account. A backup file protects you if something is deleted by mistake. Last backup: <b>${s.lastExportAt ? C.longDate(s.lastExportAt.slice(0, 10)) : 'never'}</b>.</p>
      <div class="col gap-s">
        <button class="btn primary" data-export>Download backup (JSON)</button>
        <button class="btn" data-csv>Download sets as spreadsheet (CSV)</button>
        <label class="btn ghost">Restore from backup…<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
    </div>

    <div class="card">
      <h3>Program</h3>
      <button class="btn ghost" data-reset>Reset program to the original plan</button>
    </div>

    <div class="card">
      <h3>Account</h3>
      ${ctx.mode === 'firebase'
        ? `<p class="small">Signed in as <b>${esc(user?.email || '')}</b></p><button class="btn ghost" data-signout>Sign out</button>`
        : `<p class="small warn-text">Demo mode: Firebase is not set up, so data stays in this browser only.</p>`}
    </div>
    <p class="muted small center">Muscle Tracker · ${store.sessions.size} workouts saved</p>
  `;

  return {
    html,
    mount(root) {
      $('[data-photo]', root).addEventListener('change', async e => {
        const f = e.target.files[0];
        if (!f) return;
        try { store.saveProfile({ avatar: await resizeImage(f) }); toast('Photo saved'); }
        catch (err) { toast(err.message); }
      });
      $('[data-rmphoto]', root)?.addEventListener('click', () => store.saveProfile({ avatar: '' }));
      root.addEventListener('click', e => {
        const a = e.target.closest('[data-accent]');
        if (a) store.saveSettings({ accent: a.dataset.accent });
      });
      const saveText = (sel, key) => $(sel, root).addEventListener('change', e => {
        store.saveSettings({ [key]: e.target.value.trim() }); toast('Saved');
      });
      saveText('[data-goal]', 'goal');
      saveText('[data-quote]', 'quote');
      const saveTarget = () => {
        const min = Math.max(0, Number($('[data-tmin]', root).value) || 0);
        const max = Math.max(min + 1, Number($('[data-tmax]', root).value) || min + 1);
        store.saveSettings({ targetMin: min, targetMax: max }); toast('Target saved');
      };
      $('[data-tmin]', root).addEventListener('change', saveTarget);
      $('[data-tmax]', root).addEventListener('change', saveTarget);

      $('[data-export]', root).addEventListener('click', () => {
        const backup = C.makeBackup({ program: store.program, settings: store.settings, sessions: [...store.sessions.values()] });
        download(`gym-tracker-backup-${C.todayStr()}.json`, JSON.stringify(backup, null, 1), 'application/json');
        store.saveSettings({ lastExportAt: new Date().toISOString() });
        toast('Backup downloaded');
      });
      $('[data-csv]', root).addEventListener('click', () => {
        download(`gym-tracker-sets-${C.todayStr()}.csv`, C.toCSV([...store.sessions.values()]), 'text/csv');
      });
      $('[data-import]', root).addEventListener('change', async e => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        let data;
        try {
          data = JSON.parse(await f.text());
          C.validateBackup(data);
        } catch (err) { toast(err.message.startsWith('Not a valid') ? err.message : 'Not a valid backup file'); return; }
        const ok = await confirmSheet({
          title: 'Restore this backup?',
          body: `It has ${data.sessions.length} workouts from ${data.exportedAt?.slice(0, 10) || 'unknown date'}. Your current data (${store.sessions.size} workouts and program) will be replaced.`,
          confirm: 'Replace my data', danger: true,
        });
        if (!ok) return;
        await store.replaceAll(data);
        toast(`Restored ${data.sessions.length} workouts`);
      });
      $('[data-reset]', root).addEventListener('click', () => resetProgram(store));
      $('[data-signout]', root)?.addEventListener('click', async () => {
        if (await confirmSheet({ title: 'Sign out?', body: 'Your data stays saved in your account.', confirm: 'Sign out' })) ctx.signOut();
      });
    },
  };
}
