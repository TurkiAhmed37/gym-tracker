// Small UI helpers shared by every page: escaping, sheets (pop-ups), toasts and charts.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- toast ----------
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- bottom sheet ----------
// openSheet(html, onMount) shows a pop-up from the bottom. Returns a close() function.
export function openSheet(html, onMount, onClose) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onClose?.();
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 200);
  };
  wrap.querySelector('.sheet-backdrop').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  onMount?.(wrap.querySelector('.sheet'), close);
  return close;
}

export function confirmSheet({ title, body = '', confirm = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    let ok = false;
    openSheet(`
      <h2>${esc(title)}</h2>
      ${body ? `<p class="muted">${esc(body)}</p>` : ''}
      <div class="row gap end">
        <button class="btn ghost" data-close>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirm)}</button>
      </div>`,
    (sheet, close) => sheet.querySelector('[data-ok]').addEventListener('click', () => { ok = true; close(); }),
    () => resolve(ok));
  });
}

// ---------- charts (plain SVG, no library) ----------

// Horizontal bars, one per muscle. rows: [{label, value, sub?}]. band: [min, max] or null.
export function hBars(rows, { band = null, unit = '', format = v => v } = {}) {
  const max = Math.max(1, ...rows.map(r => r.value), band ? band[1] * 1.15 : 0);
  const pct = v => Math.min(100, (v / max) * 100);
  return `<div class="hbars">
    ${rows.map(r => {
      let cls = '';
      if (band) cls = r.value < band[0] ? 'low' : r.value > band[1] ? 'high' : 'ok';
      return `<div class="hbar-row">
        <div class="hbar-label">${esc(r.label)}</div>
        <div class="hbar-track">
          ${band ? `<div class="hbar-band" style="left:${pct(band[0])}%;width:${pct(band[1]) - pct(band[0])}%"></div>` : ''}
          <div class="hbar-fill ${cls}" style="width:${pct(r.value)}%"></div>
        </div>
        <div class="hbar-val">${esc(format(r.value))}${unit}</div>
      </div>`;
    }).join('')}
  </div>`;
}

// Vertical bars over time. points: [{x: label, value, mark?: bool}]. Scrolls sideways when long.
export function columnChart(points, { band = null, format = v => v, height = 150, onTapAttr = null } = {}) {
  if (!points.length) return `<p class="muted small">No data yet.</p>`;
  const barW = 18, gap = 6, padL = 34, padB = 22, padT = 10;
  const w = padL + points.length * (barW + gap);
  const max = Math.max(1, ...points.map(p => p.value), band ? band[1] : 0) * 1.1;
  const y = v => padT + (height - padT - padB) * (1 - v / max);
  const ticks = niceTicks(max);
  let svg = `<svg class="chart" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img">`;
  if (band) svg += `<rect class="band" x="${padL}" y="${y(band[1])}" width="${w - padL}" height="${y(band[0]) - y(band[1])}"/>`;
  for (const t of ticks) {
    svg += `<line class="grid" x1="${padL}" x2="${w}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${padL - 4}" y="${y(t) + 3}" text-anchor="end">${format(t)}</text>`;
  }
  points.forEach((p, i) => {
    const x = padL + i * (barW + gap) + gap / 2;
    const top = y(p.value);
    const attr = onTapAttr ? ` ${onTapAttr}="${esc(p.key ?? p.x)}"` : '';
    svg += `<g class="col${p.mark ? ' mark' : ''}"${attr}><title>${esc(p.title || p.x)}: ${esc(format(p.value))}</title>`;
    if (p.mark) svg += `<rect class="deload-bg" x="${x - gap / 2}" y="${padT}" width="${barW + gap}" height="${height - padT - padB}"/>`;
    svg += `<rect class="bar" x="${x}" y="${top}" width="${barW}" height="${Math.max(0, height - padB - top)}" rx="3"/>`;
    if (p.showLabel) svg += `<text class="axis" x="${x + barW / 2}" y="${height - 6}" text-anchor="middle">${esc(p.x)}</text>`;
    svg += `</g>`;
  });
  svg += `</svg>`;
  return `<div class="chart-scroll" data-autoscroll>${svg}</div>`;
}

// Line chart for an exercise over time. points: [{x, value}]
export function lineChart(points, { format = v => v, height = 140 } = {}) {
  if (points.length < 2) return `<p class="muted small">${points.length ? 'Needs at least 2 sessions to draw a line.' : 'No data yet.'}</p>`;
  const padL = 38, padR = 10, padB = 22, padT = 10;
  const step = Math.max(22, 300 / points.length);
  const w = Math.max(300, padL + padR + (points.length - 1) * step);
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo = lo * 0.9; hi = hi * 1.1 || 1; }
  const pad = (hi - lo) * 0.1;
  lo = Math.max(0, lo - pad); hi += pad;
  const x = i => padL + i * ((w - padL - padR) / (points.length - 1));
  const y = v => padT + (height - padT - padB) * (1 - (v - lo) / (hi - lo));
  const ticks = [lo, (lo + hi) / 2, hi];
  let svg = `<svg class="chart" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img">`;
  for (const t of ticks) svg += `<line class="grid" x1="${padL}" x2="${w - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${padL - 4}" y="${y(t) + 3}" text-anchor="end">${format(t)}</text>`;
  svg += `<polyline class="line" points="${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}"/>`;
  points.forEach((p, i) => {
    svg += `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="3.5"><title>${esc(p.x)}: ${esc(format(p.value))}</title></circle>`;
  });
  const every = Math.ceil(points.length / 6);
  points.forEach((p, i) => {
    if (i % every === 0 || i === points.length - 1) svg += `<text class="axis" x="${x(i)}" y="${height - 6}" text-anchor="middle">${esc(p.x)}</text>`;
  });
  svg += `</svg>`;
  return `<div class="chart-scroll" data-autoscroll>${svg}</div>`;
}

function niceTicks(max) {
  const raw = max / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const out = [];
  for (let t = 0; t <= max; t += step) out.push(Math.round(t * 100) / 100);
  return out;
}

// Scroll charts to the newest data (right edge) after render.
export function autoscroll(root) {
  $$('[data-autoscroll]', root).forEach(el => { el.scrollLeft = el.scrollWidth; });
}

// Resize a picked photo to a small square JPEG data URL (fits easily in Firestore).
export function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

export function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
