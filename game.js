(() => {
  'use strict';
  const N = 8;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const $ = (id) => document.getElementById(id);
  const canvas = $('board'), ctx = canvas.getContext('2d');
  const trayEl = $('tray'), overEl = $('over'), settingsEl = $('settings');
  const rootStyle = getComputedStyle(document.documentElement);
  const tok = (n, f) => rootStyle.getPropertyValue(n).trim() || f;
  const COLORS = ['#f0524d', '#ff9d2e', '#f2d64b', '#58cc59', '#3aa9f2', '#a864f0'].map((f, i) => tok('--c' + i, f));
  let C_CELL = tok('--cell', '#212b76'), C_CELL2 = tok('--cell-alt', '#27338a'), C_BOARD = tok('--board', '#0f1540');
  let C_ACCENT = tok('--accent', '#ffd23f');
  const DISPLAY = tok('--display', "'Arial Rounded MT Bold', Arial, sans-serif");
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GAIN = 1.25; /* how far a piece moves per finger movement on touch screens */
  const GAP = 0.035; /* space around each block, as a share of the cell size */
  const RADIUS = 0.13; /* corner roundness of a block, as a share of the cell size */

  /* ---------- drawing helpers ---------- */
  const shadeCache = {};
  function shade(hex, a) {
    const key = hex + a;
    if (shadeCache[key]) return shadeCache[key];
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = a < 0 ? 0 : 255, p = Math.abs(a);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return (shadeCache[key] = 'rgb(' + r + ',' + g + ',' + b + ')');
  }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  /* a beveled tile: light rim on top, dark rim underneath, flat color inside, soft gloss */
  function drawBlock(g, x, y, s, color, alpha) {
    const m = s * GAP, w = s - m * 2, rad = s * RADIUS, ins = s * 0.085;
    g.globalAlpha = alpha;
    g.fillStyle = shade(color, -0.3);
    rr(g, x + m, y + m, w, w, rad); g.fill();
    g.fillStyle = shade(color, 0.32);
    rr(g, x + m, y + m, w, w - ins * 0.7, rad); g.fill();
    g.fillStyle = color;
    rr(g, x + m + ins, y + m + ins, w - ins * 2, w - ins * 2 - ins * 0.5, rad * 0.6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)';
    rr(g, x + m + ins, y + m + ins, w - ins * 2, (w - ins * 2) * 0.32, rad * 0.6); g.fill();
    g.globalAlpha = 1;
  }
  function star(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r); g.lineTo(x + r * 0.28, y - r * 0.28); g.lineTo(x + r, y); g.lineTo(x + r * 0.28, y + r * 0.28);
    g.lineTo(x, y + r); g.lineTo(x - r * 0.28, y + r * 0.28); g.lineTo(x - r, y); g.lineTo(x - r * 0.28, y - r * 0.28);
    g.closePath(); g.fill();
  }

  /* pre-rendered board background and block sprites keep each frame cheap */
  let bgCv = null, sprites = {};
  function bgCanvas() {
    if (bgCv) return bgCv;
    bgCv = document.createElement('canvas');
    bgCv.width = size * DPR; bgCv.height = size * DPR;
    const g = bgCv.getContext('2d');
    g.scale(DPR, DPR);
    g.fillStyle = C_BOARD; rr(g, 0, 0, size, size, cell * 0.2); g.fill();
    const m = cell * GAP;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        g.fillStyle = ((r >> 2) + (c >> 2)) & 1 ? C_CELL2 : C_CELL;
        rr(g, c * cell + m, r * cell + m, cell - m * 2, cell - m * 2, cell * 0.1); g.fill();
      }
    }
    return bgCv;
  }
  function spr(color) {
    let s = sprites[color];
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = Math.ceil(cell * DPR);
      const g = s.getContext('2d');
      g.scale(s.width / cell, s.width / cell);
      drawBlock(g, 0, 0, cell, color, 1);
      sprites[color] = s;
    }
    return s;
  }

  /* ---------- shapes ---------- */
  const PATTERNS = [
    ['#'],
    ['##'], ['#', '#'],
    ['###'], ['#', '#', '#'],
    ['####'], ['#', '#', '#', '#'],
    ['#####'], ['#', '#', '#', '#', '#'],
    ['##', '##'],
    ['###', '###', '###'],
    ['###', '###'], ['##', '##', '##'],
    ['##', '#.'], ['##', '.#'], ['#.', '##'], ['.#', '##'],
    ['#..', '#..', '###'], ['..#', '..#', '###'], ['###', '#..', '#..'], ['###', '..#', '..#'],
    ['#.', '#.', '##'], ['.#', '.#', '##'], ['##', '#.', '#.'], ['##', '.#', '.#'],
    ['###', '.#.'], ['.#.', '###'], ['#.', '##', '#.'], ['.#', '##', '.#'],
    ['.##', '##.'], ['##.', '.##'], ['#.', '##', '.#'], ['.#', '##', '#.']
  ];
  const SHAPES = PATTERNS.map((rows) => {
    const cells = [];
    rows.forEach((s, r) => [...s].forEach((ch, c) => { if (ch === '#') cells.push([r, c]); }));
    const long = cells.length === 5 && (rows.length === 1 || rows[0].length === 1);
    const base = cells.length === 1 ? 0.5 : long ? 0.7 : cells.length === 9 ? 0.6 : 1;
    return { cells, h: rows.length, w: rows[0].length, base };
  });

  /* ---------- state ---------- */
  let grid, tray, score, shown = 0, best = 0, combo, sinceClear, over, dragging = null, epoch = 0, dirty = true;
  let fx = [], parts = [], pops = [], rings = [], beams = [], lands = [], flash = 0, shake = 0;
  let cell = 56, size = 448;
  let themeId = 'midnight', lastLevel = 0;

  /* ---------- themes: each one sets the page colors and the six block colors ---------- */
  const THEMES = {
    midnight: { name: 'Midnight', v: { bg: '#18215a', glow: 'rgba(96,120,255,0.38)', board: '#0f1540', cell: '#212b76', 'cell-alt': '#27338a', panel: '#2a3898', line: '#4254bd', accent: '#ffd23f', 'accent-ink': '#3a2a00', scrim: 'rgba(7,11,38,0.74)' }, c: ['#f0524d', '#ff9d2e', '#f2d64b', '#58cc59', '#3aa9f2', '#a864f0'] },
    sunset: { name: 'Sunset', v: { bg: '#3b1d4f', glow: 'rgba(255,140,90,0.36)', board: '#25102f', cell: '#3a1d4a', 'cell-alt': '#43225a', panel: '#55306e', line: '#7a4a99', accent: '#ffd23f', 'accent-ink': '#3a2a00', scrim: 'rgba(24,8,34,0.76)' }, c: ['#ff5a5f', '#ff9f43', '#ffd93d', '#6bd968', '#48c9e8', '#c48bff'] },
    forest: { name: 'Forest', v: { bg: '#123b2e', glow: 'rgba(80,220,140,0.3)', board: '#0a261d', cell: '#134233', 'cell-alt': '#17503d', panel: '#1c6048', line: '#2f8a67', accent: '#ffe04a', 'accent-ink': '#3a2f00', scrim: 'rgba(4,22,16,0.76)' }, c: ['#f26b5b', '#f2a33a', '#e8d84a', '#7bd957', '#3fc6c0', '#8f7cf0'] },
    ocean: { name: 'Ocean', v: { bg: '#0e4a6e', glow: 'rgba(120,230,255,0.34)', board: '#082f47', cell: '#0f4966', 'cell-alt': '#135578', panel: '#1a6a96', line: '#3b94c2', accent: '#ffe066', 'accent-ink': '#3a2f00', scrim: 'rgba(3,26,42,0.76)' }, c: ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#b197fc'] },
    candy: { name: 'Candy', v: { bg: '#5a1d55', glow: 'rgba(255,120,220,0.36)', board: '#3c1038', cell: '#571f52', 'cell-alt': '#62275c', panel: '#7d3578', line: '#a355a0', accent: '#ffe45c', 'accent-ink': '#3a2f00', scrim: 'rgba(36,6,32,0.76)' }, c: ['#ff5c8a', '#ff9a5c', '#ffe45c', '#5cf0a0', '#5cc8ff', '#c07dff'] },
    graphite: { name: 'Graphite', v: { bg: '#1d1f24', glow: 'rgba(160,170,200,0.2)', board: '#121317', cell: '#22252c', 'cell-alt': '#282c34', panel: '#2e323b', line: '#484e5c', accent: '#ffcf4a', 'accent-ink': '#3a2a00', scrim: 'rgba(8,9,12,0.78)' }, c: ['#ff5252', '#ff9800', '#ffd600', '#4caf50', '#29b6f6', '#ab47bc'] }
  };
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function applyTheme(id) {
    const t = THEMES[id] || THEMES.midnight;
    themeId = THEMES[id] ? id : 'midnight';
    const old = COLORS.slice();
    const st = document.documentElement.style;
    for (const k in t.v) st.setProperty('--' + k, t.v[k]);
    t.c.forEach((col, i) => { COLORS[i] = col; st.setProperty('--c' + i, col); });
    st.backgroundColor = t.v.bg;
    C_CELL = t.v.cell; C_CELL2 = t.v['cell-alt']; C_BOARD = t.v.board; C_ACCENT = t.v.accent;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.v.bg);
    bgCv = null; sprites = {}; dirty = true;
    if (tray && tray.length) {
      tray.forEach((p) => { const i = old.indexOf(p.color); if (i >= 0) p.color = COLORS[i]; });
      buildTray(false);
    }
  }
  /* soft colored glow behind the board whenever lines clear; the whole backdrop slowly shifts hue as the score grows */
  function pulseAura(color, n) {
    if (reduce) return;
    const a = $('aura');
    a.style.background = 'radial-gradient(80% 55% at 50% 48%, ' + rgba(color, 0.55) + ', transparent 72%)';
    if (a.animate) a.animate([{ opacity: 0 }, { opacity: Math.min(1, 0.5 + n * 0.15), offset: 0.2 }, { opacity: 0 }], { duration: 900 + n * 150, easing: 'ease-out' });
  }
  function driftSky() {
    if (reduce) return;
    const level = Math.floor(score / 1500);
    if (level === lastLevel) return;
    lastLevel = level;
    $('sky').style.filter = 'hue-rotate(' + (level * 38) % 360 + 'deg)';
    pulseAura(C_ACCENT, 2);
  }
  let soundOn = true, vibLevel = 2, helpful = true, ac = null;
  let setNo = 0, recent = [];
  const canVibrate = typeof navigator.vibrate === 'function';
  try { best = parseInt(localStorage.getItem('brickyard-best') || '0', 10) || 0; } catch (e) { /* storage blocked */ }
  try { if (localStorage.getItem('brickyard-sound') === '0') soundOn = false; } catch (e) { /* ignore */ }
  try { if (localStorage.getItem('brickyard-help') === '0') helpful = false; } catch (e) { /* ignore */ }
  try { const v = parseInt(localStorage.getItem('brickyard-vib'), 10); if (v >= 0 && v <= 3) vibLevel = v; } catch (e) { /* ignore */ }

  const filled = () => { let n = 0; for (const row of grid) for (const v of row) if (v >= 0) n++; return n; };
  function fits(p, r, c) {
    for (const [dr, dc] of p.cells) {
      const rr_ = r + dr, cc = c + dc;
      if (rr_ < 0 || cc < 0 || rr_ >= N || cc >= N || grid[rr_][cc] >= 0) return false;
    }
    return true;
  }
  function canFit(p) {
    for (let r = 0; r <= N - p.h; r++) for (let c = 0; c <= N - p.w; c++) if (fits(p, r, c)) return true;
    return false;
  }
  function linesFor(p, r, c) {
    const tmp = grid.map((row) => row.slice());
    for (const [dr, dc] of p.cells) tmp[r + dr][c + dc] = 0;
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      if (tmp[i].every((v) => v >= 0)) rows.push(i);
      let full = true;
      for (let j = 0; j < N; j++) if (tmp[j][i] < 0) { full = false; break; }
      if (full) cols.push(i);
    }
    return { rows, cols };
  }
  function pickShape() {
    const crowded = filled() > 34;
    const weights = SHAPES.map((s) => {
      let w = s.base;
      if (crowded && s.cells.length <= 3) w *= 2.5;
      if (crowded && s.cells.length >= 5) w *= 0.5;
      return w;
    });
    let total = weights.reduce((a, b) => a + b, 0), x = Math.random() * total;
    for (let i = 0; i < SHAPES.length; i++) { x -= weights[i]; if (x <= 0) return SHAPES[i]; }
    return SHAPES[0];
  }
  /* ---- helpful pieces: look ahead on the real board and hand out the three pieces that can score the most ---- */
  const cloneG = (g) => g.map((r) => r.slice());
  function fitsOn(g, s, r, c) {
    for (const [dr, dc] of s.cells) {
      const y = r + dr, x = c + dc;
      if (y < 0 || x < 0 || y >= N || x >= N || g[y][x] >= 0) return false;
    }
    return true;
  }
  function placeOn(g, s, r, c) {
    const t = cloneG(g);
    for (const [dr, dc] of s.cells) t[r + dr][c + dc] = 0;
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      if (t[i].every((v) => v >= 0)) rows.push(i);
      let full = true;
      for (let j = 0; j < N; j++) if (t[j][i] < 0) { full = false; break; }
      if (full) cols.push(i);
    }
    rows.forEach((r_) => { for (let j = 0; j < N; j++) t[r_][j] = -1; });
    cols.forEach((c_) => { for (let j = 0; j < N; j++) t[j][c_] = -1; });
    return { g: t, n: rows.length + cols.length };
  }
  /* board health: many empty cells, no dead pockets, lines that are almost full */
  function health(g) {
    let empty = 0, pockets = 0, near = 0;
    for (let r = 0; r < N; r++) {
      let rowFill = 0;
      for (let c = 0; c < N; c++) {
        if (g[r][c] >= 0) { rowFill++; continue; }
        empty++;
        let blocked = 0;
        if (r === 0 || g[r - 1][c] >= 0) blocked++;
        if (r === N - 1 || g[r + 1][c] >= 0) blocked++;
        if (c === 0 || g[r][c - 1] >= 0) blocked++;
        if (c === N - 1 || g[r][c + 1] >= 0) blocked++;
        if (blocked === 4) pockets++;
      }
      if (rowFill >= 6 && rowFill < N) near += rowFill - 5;
    }
    for (let c = 0; c < N; c++) {
      let colFill = 0;
      for (let r = 0; r < N; r++) if (g[r][c] >= 0) colFill++;
      if (colFill >= 6 && colFill < N) near += colFill - 5;
    }
    return empty * 0.5 - pockets * 4 + near * 1.2;
  }
  function fitCount(g) {
    let k = 0;
    for (const s of SHAPES) {
      let ok = false;
      for (let r = 0; r <= N - s.h && !ok; r++) for (let c = 0; c <= N - s.w && !ok; c++) if (fitsOn(g, s, r, c)) ok = true;
      if (ok) k++;
    }
    return k;
  }
  function options(g, taken) {
    const out = [];
    SHAPES.forEach((s, si) => {
      /* repeating a shape from this set or the previous one costs points, so the shapes keep changing */
      const dup = (taken.indexOf(si) >= 0 ? 8 : 0) + (recent.indexOf(si) >= 0 ? 4 : 0);
      for (let r = 0; r <= N - s.h; r++) {
        for (let c = 0; c <= N - s.w; c++) {
          if (!fitsOn(g, s, r, c)) continue;
          const res = placeOn(g, s, r, c);
          out.push({ si, res, v: (res.n > 0 ? 10 * res.n * res.n : 0) + s.cells.length * 0.2 + 0.3 * health(res.g) - dup });
        }
      }
    });
    return out;
  }
  function genHelpful() {
    const first = options(grid, []);
    if (!first.length) return null;
    first.sort((a, b) => b.v - a.v);
    const tops = [], seen = new Set();
    for (const o of first) { if (!seen.has(o.si)) { seen.add(o.si); tops.push(o); } if (tops.length >= 4) break; }
    let bestPicks = null, bestScore = -1e9;
    for (const t of tops) {
      let g = t.res.g, total = t.v;
      const picks = [t.si];
      for (let k = 1; k < 3; k++) {
        const opts = options(g, picks);
        if (!opts.length) break;
        let b = opts[0];
        for (const o of opts) if (o.v > b.v) b = o;
        picks.push(b.si); g = b.res.g; total += b.v;
      }
      const score = total + (picks.length === 3 ? 20 : -30 * (3 - picks.length)) + 0.8 * fitCount(g) + Math.random() * 5;
      if (score > bestScore) { bestScore = score; bestPicks = picks; }
    }
    while (bestPicks.length < 3) bestPicks.push(0);
    return bestPicks.sort(() => Math.random() - 0.5);
  }
  /* can all three pieces still be placed on this board, in some order? (bounded search) */
  function solvable(g, ids) {
    let budget = 3000;
    function rec(gr, rest) {
      if (!rest.length) return true;
      for (let k = 0; k < rest.length; k++) {
        const s = SHAPES[rest[k]], others = rest.filter((_, i) => i !== k);
        for (let r = 0; r <= N - s.h; r++) {
          for (let c = 0; c <= N - s.w; c++) {
            if (!fitsOn(gr, s, r, c)) continue;
            if (--budget < 0) return false;
            if (rec(placeOn(gr, s, r, c).g, others)) return true;
          }
        }
      }
      return false;
    }
    return rec(g, ids);
  }
  /* every fourth set: odd shapes (L, T, zigzag) instead of the best-scoring ones, still always playable */
  function genVariety() {
    const pool = [];
    SHAPES.forEach((s, si) => { if (s.cells.length !== s.w * s.h && s.cells.length <= 4 && canFit(s)) pool.push(si); });
    if (pool.length < 3) return null;
    for (let attempt = 0; attempt < 15; attempt++) {
      pool.sort(() => Math.random() - 0.5);
      const fresh = pool.filter((si) => recent.indexOf(si) < 0);
      const src = fresh.length >= 3 ? fresh : pool;
      const picks = src.slice(0, 3);
      if (solvable(grid, picks)) return picks;
    }
    return null;
  }
  function genSet() {
    setNo++;
    if (helpful) {
      const picks = (setNo % 4 === 0 ? genVariety() : null) || genHelpful();
      if (picks) {
        recent = picks.slice();
        const colors = COLORS.slice().sort(() => Math.random() - 0.5);
        return picks.map((si, i) => { const s = SHAPES[si]; return { cells: s.cells, w: s.w, h: s.h, color: colors[i], used: false }; });
      }
    }
    return genRandomSet();
  }
  function genRandomSet() {
    let set;
    for (let attempt = 0; attempt < 30; attempt++) {
      const colors = COLORS.slice().sort(() => Math.random() - 0.5);
      set = [0, 1, 2].map((i) => { const s = pickShape(); return { cells: s.cells, w: s.w, h: s.h, color: colors[i], used: false }; });
      if (set.some(canFit)) return set;
    }
    return set;
  }

  /* ---------- audio and vibration ---------- */
  function audio() {
    if (!soundOn) return;
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource();
        s.buffer = b; s.connect(ac.destination); s.start(0);
      }
      if (ac.state === 'suspended' || ac.state === 'interrupted') ac.resume();
    } catch (e) { ac = null; }
  }
  /* iOS only starts audio from touchend or click, so unlock on those too */
  ['touchend', 'click'].forEach((ev) => document.addEventListener(ev, audio, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) audio(); });
  function tone(f0, dur, type, vol, delay, f1) {
    if (!soundOn || !ac) return;
    try {
      const t = ac.currentTime + (delay || 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319];
  function sfxPlace() { tone(210, 0.1, 'triangle', 0.12, 0, 120); }
  function sfxClear(n, cmb) {
    const start = Math.min(cmb - 1, 3);
    for (let k = 0; k < n + 2; k++) tone(SCALE[Math.min(start + k, SCALE.length - 1)], 0.18, 'triangle', 0.09, k * 0.06);
    if (n >= 3) tone(1568, 0.35, 'sine', 0.06, 0.2);
  }
  function sfxOver() { [392, 330, 262, 196].forEach((f, k) => tone(f, 0.28, 'sine', 0.09, k * 0.14)); }
  /* vibration: durations in ms (odd entries are pauses), scaled by the chosen strength */
  function buzz(pattern) {
    if (!canVibrate || !vibLevel) return;
    const k = [0, 0.6, 1.1, 1.8][vibLevel];
    try { navigator.vibrate(pattern.map((v, i) => (i % 2 === 0 ? Math.max(5, Math.round(v * k)) : v))); } catch (e) { /* ignore */ }
  }

  /* ---------- layout & tray ---------- */
  function layout() {
    const stageW = $('stage').clientWidth || 480;
    const headerH = $('top').offsetHeight + $('scorebox').offsetHeight + 8;
    const availH = Math.max(300, window.innerHeight - 24 - headerH - 14);
    cell = Math.floor(Math.max(26, Math.min(stageW / N, availH / (N + 2.6), 70)));
    size = cell * N;
    bgCv = null; sprites = {}; dirty = true;
    canvas.width = size * DPR; canvas.height = size * DPR;
    canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
    trayEl.style.width = size + 'px';
    overEl.style.borderRadius = Math.round(cell * 0.2) + 'px';
    buildTray(false);
  }
  function pieceCanvas(p, px) {
    const cv = document.createElement('canvas');
    const w = p.w * px, h = p.h * px;
    cv.width = w * DPR; cv.height = h * DPR;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const g = cv.getContext('2d');
    g.scale(DPR, DPR);
    for (const [r, c] of p.cells) drawBlock(g, c * px, r * px, px, p.color, 1);
    return cv;
  }
  function buildTray(animate) {
    trayEl.innerHTML = '';
    tray.forEach((p, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.i = String(i);
      slot.style.height = Math.round(cell * 2.6) + 'px';
      if (!p.used) {
        const cv = pieceCanvas(p, Math.floor(cell * 0.5));
        if (animate && !reduce) { cv.classList.add('enter'); cv.style.animationDelay = i * 70 + 'ms'; }
        slot.appendChild(cv);
      }
      trayEl.appendChild(slot);
    });
  }

  /* ---------- HUD ---------- */
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  let scoreRaf = 0;
  function tickScore() {
    scoreRaf = 0;
    if (shown === score) return;
    const diff = score - shown;
    shown = diff < 0 || reduce ? score : shown + Math.max(1, Math.ceil(diff * 0.16));
    $('score').textContent = shown.toLocaleString();
    if (shown !== score) scoreRaf = requestAnimationFrame(tickScore);
  }
  function hud(bumpScore) {
    dirty = true;
    driftSky();
    $('best').textContent = best.toLocaleString();
    if (!scoreRaf) scoreRaf = requestAnimationFrame(tickScore);
    if (bumpScore) bump($('score'));
  }

  /* ---------- game flow ---------- */
  function newGame() {
    epoch++;
    grid = Array.from({ length: N }, () => Array(N).fill(-1));
    score = 0; shown = 0; combo = 0; sinceClear = 0; over = false;
    $('score').textContent = '0';
    fx = []; parts = []; pops = []; rings = []; beams = []; lands = []; flash = 0; shake = 0;
    lastLevel = 0; $('sky').style.filter = '';
    setNo = 0; recent = [];
    tray = genSet();
    overEl.hidden = true;
    buildTray(true);
    hud(false);
  }

  function place(i, r, c) {
    const p = tray[i];
    const { rows, cols } = linesFor(p, r, c);
    for (const [dr, dc] of p.cells) grid[r + dr][c + dc] = COLORS.indexOf(p.color);
    p.used = true;
    let gain = p.cells.length;
    const n = rows.length + cols.length;
    const now = performance.now();
    const cx = (c + p.w / 2) * cell, cy = (r + p.h / 2) * cell;
    if (!reduce) p.cells.forEach(([dr, dc]) => lands.push({ r: r + dr, c: c + dc, color: p.color, t0: now }));

    if (n > 0) {
      const inRow = new Set(rows), inCol = new Set(cols);
      const keys = new Set();
      rows.forEach((row) => { for (let j = 0; j < N; j++) keys.add(row * N + j); });
      cols.forEach((col) => { for (let j = 0; j < N; j++) keys.add(j * N + col); });
      /* a different animation depending on how many lines go at once */
      const style = n >= 4 ? 'big' : n === 3 ? 'laser' : n === 2 ? 'shatter' : (Math.random() < 0.5 ? 'wave' : 'spin');
      let sx = 0, sy = 0, count = 0;
      keys.forEach((key) => {
        const rr_ = Math.floor(key / N), cc = key % N;
        const color = COLORS[grid[rr_][cc]];
        const px = (cc + 0.5) * cell, py = (rr_ + 0.5) * cell;
        const dist = Math.hypot(px - cx, py - cy) / cell;
        let delay, kind, dur;
        if (style === 'wave') { kind = 'shrink'; delay = dist * 30; dur = 420; }
        else if (style === 'spin') { kind = 'spin'; delay = dist * 30; dur = 480; }
        else if (style === 'shatter') { kind = 'shatter'; delay = dist * 18; dur = 260; }
        else if (style === 'laser') {
          const idx = [];
          if (inRow.has(rr_)) idx.push(cc);
          if (inCol.has(cc)) idx.push(rr_);
          kind = 'shrink'; delay = Math.min.apply(null, idx) * 38; dur = 360;
        } else { kind = (rr_ + cc) % 2 ? 'spin' : 'shatter'; delay = dist * 22; dur = 440; }
        fx.push({ r: rr_, c: cc, color, t0: now + delay, dur, kind });
        if (!reduce) {
          const burst = style === 'shatter' || style === 'big' ? 7 : 3;
          const away = dist > 0.2 ? Math.atan2(py - cy, px - cx) : Math.random() * 6.283;
          for (let k = 0; k < burst; k++) {
            const a = style === 'shatter' || style === 'big' ? away + (Math.random() - 0.5) * 1.8 : Math.random() * 6.283;
            const sp = cell * (style === 'shatter' || style === 'big' ? 4 + Math.random() * 5 : 2 + Math.random() * 3);
            parts.push({
              x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - cell * 2,
              life: 0.7 + Math.random() * 0.5, age: -delay / 1000, color,
              s: cell * (0.1 + Math.random() * 0.12), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12,
              shape: style === 'big' && Math.random() < 0.45 ? 'star' : 'sq'
            });
          }
        }
        grid[rr_][cc] = -1;
        sx += px; sy += py; count++;
      });
      if (!reduce) {
        if (style === 'laser' || style === 'big') {
          rows.forEach((row) => beams.push({ type: 'row', idx: row, t0: now, dur: N * 38 + 320 }));
          cols.forEach((col) => beams.push({ type: 'col', idx: col, t0: now, dur: N * 38 + 320 }));
        }
        if (n >= 2) rings.push({ x: cx, y: cy, t0: now, dur: 620, maxR: size * 0.6 });
        if (style === 'big') rings.push({ x: cx, y: cy, t0: now + 140, dur: 760, maxR: size * 0.9 });
        if (n >= 3) flash = Math.min(1, 0.45 + 0.2 * (n - 3));
        if (n >= 2) shake = Math.min(1, 0.4 + n * 0.2);
      }
      combo += 1; sinceClear = 0;
      const mult = 1 + 0.5 * (combo - 1);
      const lineScore = Math.round(10 * n * n * mult);
      gain += lineScore;
      const words = ['Good', 'Great', 'Excellent', 'Amazing', 'Unbelievable'];
      const lines = [{ text: words[Math.min(n, 5) - 1], scale: 1, color: '#ffffff' }, { text: '+' + (p.cells.length + lineScore), scale: 0.72, color: C_ACCENT }];
      if (combo >= 2) lines.push({ text: 'Combo x' + combo, scale: 0.58, color: COLORS[3] });
      let perfect = true;
      for (const row of grid) for (const v of row) if (v >= 0) perfect = false;
      if (perfect) { gain += 300; lines.unshift({ text: 'Perfect board +300', scale: 0.6, color: COLORS[3] }); }
      pops.push({
        x: Math.max(size * 0.24, Math.min(size * 0.76, sx / count)),
        y: Math.max(size * 0.2, Math.min(size * 0.8, sy / count)),
        t0: now, dur: 1250, lines
      });
      sfxClear(n, combo);
      pulseAura(p.color, n);
      buzz(n === 1 ? [26] : n === 2 ? [30, 40, 30] : n === 3 ? [36, 40, 36, 40, 48] : [40, 40, 40, 40, 40, 40, 80]);
    } else {
      sinceClear += 1;
      if (sinceClear >= 3) combo = 0;
      sfxPlace();
      buzz([10]);
    }
    score += gain;
    if (score > best) {
      best = score;
      try { localStorage.setItem('brickyard-best', String(best)); } catch (e) { /* ignore */ }
      if (!reduce) { const b = $('bestbox'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
    }
    hud(true);

    const ep = epoch;
    if (tray.every((q) => q.used)) {
      setTimeout(() => {
        if (ep !== epoch || over) return;
        tray = genSet(); buildTray(true); checkOver(ep);
      }, 280);
    } else {
      checkOver(ep);
    }
  }
  function checkOver(ep) {
    if (!tray.some((q) => !q.used && canFit(q))) setTimeout(() => { if (ep === epoch) endGame(); }, 650);
  }
  function endGame() {
    over = true;
    sfxOver();
    buzz([60, 60, 120]);
    $('finalScore').textContent = score.toLocaleString();
    $('finalNote').textContent = score > 0 && score >= best ? 'New best score!' : 'Best: ' + best.toLocaleString();
    overEl.hidden = false;
  }

  /* ---------- dragging ---------- */
  function onMove(e) {
    if (!dragging || e.pointerId !== dragging.pid) return;
    const d = dragging;
    const lift = d.touch ? d.ph / 2 + cell * 1.4 : cell * 0.25;
    const k = d.touch ? GAIN : 1;
    const cx = d.sx + (e.clientX - d.sx) * k, cy = d.sy + (e.clientY - d.sy) * k - lift;
    const x = cx - d.pw / 2, y = cy - d.ph / 2;
    d.el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    const rect = canvas.getBoundingClientRect();
    const fr = (y - rect.top) / cell, fc = (x - rect.left) / cell;
    let bestPos = null, bestDist = Infinity;
    for (const r of [Math.floor(fr), Math.ceil(fr)]) {
      for (const c of [Math.floor(fc), Math.ceil(fc)]) {
        if (r < 0 || c < 0 || r > N - d.p.h || c > N - d.p.w) continue;
        if (!fits(d.p, r, c)) continue;
        const dist = Math.hypot(r - fr, c - fc);
        if (dist < bestDist && dist < 1.1) { bestDist = dist; bestPos = [r, c]; }
      }
    }
    d.pos = bestPos;
    d.lines = bestPos ? linesFor(d.p, bestPos[0], bestPos[1]) : null;
  }
  function endDrag(commit) {
    if (!dragging) return;
    const d = dragging;
    dragging = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    document.body.classList.remove('dragging');
    dirty = true;
    d.el.remove();
    const slot = trayEl.querySelector('.slot[data-i="' + d.i + '"]');
    if (slot) slot.classList.remove('lifted');
    if (commit && d.pos && !over) {
      place(d.i, d.pos[0], d.pos[1]);
      if (slot) { const cv = slot.querySelector('canvas'); if (cv) cv.remove(); }
    }
  }
  function onUp(e) { if (dragging && e.pointerId === dragging.pid) endDrag(true); }
  function onCancel(e) { if (dragging && e.pointerId === dragging.pid) endDrag(false); }

  trayEl.addEventListener('pointerdown', (e) => {
    if (over || dragging || !settingsEl.hidden) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const i = parseInt(slot.dataset.i, 10), p = tray[i];
    if (!p || p.used) return;
    e.preventDefault();
    audio();
    const el = pieceCanvas(p, cell);
    el.className = 'drag';
    document.body.appendChild(el);
    dragging = { i, p, el, pw: p.w * cell, ph: p.h * cell, touch: e.pointerType === 'touch', pid: e.pointerId, pos: null, lines: null, sx: e.clientX, sy: e.clientY };
    slot.classList.add('lifted');
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    onMove(e);
  });

  /* ---------- render loop ---------- */
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const hadFx = !!(fx.length || parts.length || pops.length || rings.length || beams.length || lands.length || flash > 0 || shake > 0 || dragging);
    if (!dirty && !hadFx) { requestAnimationFrame(frame); return; }
    const g = ctx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, size, size);
    if (shake > 0) {
      g.translate((Math.random() - 0.5) * 9 * shake, (Math.random() - 0.5) * 9 * shake);
      shake = Math.max(0, shake - dt * 3);
    }
    g.drawImage(bgCanvas(), 0, 0, size, size);

    const m = cell * GAP;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = grid[r][c];
        if (v >= 0) g.drawImage(spr(COLORS[v]), c * cell, r * cell, cell, cell);
      }
    }
    /* a quick squash-and-settle on every block that has just been placed */
    for (const l of lands) {
      const lp = (t - l.t0) / 190;
      if (lp < 0 || lp >= 1) continue;
      const ls = cell * (1 + 0.17 * Math.sin(Math.PI * lp));
      g.drawImage(spr(l.color), (l.c + 0.5) * cell - ls / 2, (l.r + 0.5) * cell - ls / 2, ls, ls);
    }
    if (lands.length) lands = lands.filter((l) => t - l.t0 < 190);

    if (dragging && dragging.pos) {
      const d = dragging, [pr, pc] = d.pos;
      if (d.lines) {
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 2;
        const mark = (r, c) => { rr(g, c * cell + m, r * cell + m, cell - m * 2, cell - m * 2, cell * RADIUS); g.fill(); g.stroke(); };
        d.lines.rows.forEach((r) => { for (let c = 0; c < N; c++) mark(r, c); });
        d.lines.cols.forEach((c) => { for (let r = 0; r < N; r++) mark(r, c); });
      }
      for (const [dr, dc] of d.p.cells) drawBlock(g, (pc + dc) * cell, (pr + dr) * cell, cell, d.p.color, 0.55);
    }

    for (const f of fx) {
      const p = (t - f.t0) / f.dur;
      if (p >= 1) continue;
      if (p < 0) { g.drawImage(spr(f.color), f.c * cell, f.r * cell, cell, cell); continue; }
      const cx = (f.c + 0.5) * cell, cy = (f.r + 0.5) * cell;
      if (f.kind === 'shatter') {
        if (p < 0.4) {
          const s = cell * (1 + 0.16 * Math.sin(p / 0.4 * Math.PI));
          drawBlock(g, cx - s / 2, cy - s / 2, s, f.color, 1);
          g.fillStyle = 'rgba(255,255,255,' + 0.85 * (1 - p / 0.4) + ')';
          rr(g, cx - s / 2 + m, cy - s / 2 + m, s - m * 2, s - m * 2, s * RADIUS); g.fill();
        }
      } else if (f.kind === 'spin') {
        const s = cell * (1 - p * p);
        if (s > 1) {
          g.save(); g.translate(cx, cy); g.rotate(p * Math.PI * 1.7);
          drawBlock(g, -s / 2, -s / 2, s, f.color, 1 - p * 0.35);
          g.restore();
        }
      } else {
        const pop = 1 + 0.14 * Math.sin(Math.min(p * 3, 1) * Math.PI);
        const s = cell * pop * (1 - Math.max(0, p - 0.35) / 0.65);
        if (s > 1) {
          drawBlock(g, cx - s / 2, cy - s / 2, s, f.color, 1 - p * 0.5);
          if (p < 0.35) {
            g.fillStyle = 'rgba(255,255,255,' + 0.7 * (1 - p / 0.35) + ')';
            rr(g, cx - s / 2 + m, cy - s / 2 + m, s - m * 2, s - m * 2, s * RADIUS); g.fill();
          }
        }
      }
    }
    if (fx.length) fx = fx.filter((f) => t - f.t0 < f.dur);

    for (const b of beams) {
      const p = (t - b.t0) / b.dur;
      if (p < 0 || p >= 1) continue;
      const pos = -cell + p * (size + cell * 2);
      const horiz = b.type === 'row';
      const grad = horiz ? g.createLinearGradient(pos - cell, 0, pos + cell, 0) : g.createLinearGradient(0, pos - cell, 0, pos + cell);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,' + 0.9 * (1 - p * 0.5) + ')');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      if (horiz) g.fillRect(pos - cell, b.idx * cell, cell * 2, cell);
      else g.fillRect(b.idx * cell, pos - cell, cell, cell * 2);
    }
    if (beams.length) beams = beams.filter((b) => t - b.t0 < b.dur);

    for (const q of parts) {
      q.age += dt;
      if (q.age < 0) continue;
      q.vy += cell * 16 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.spin * dt;
      const a = 1 - q.age / q.life;
      if (a <= 0) continue;
      g.globalAlpha = a; g.fillStyle = q.shape === 'star' ? '#fff3b0' : q.color;
      g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
      if (q.shape === 'star') star(g, 0, 0, q.s * 1.6);
      else g.fillRect(-q.s / 2, -q.s / 2, q.s, q.s);
      g.restore(); g.globalAlpha = 1;
    }
    if (parts.length) parts = parts.filter((q) => q.age < q.life);

    for (const rg of rings) {
      const p = (t - rg.t0) / rg.dur;
      if (p < 0 || p >= 1) continue;
      g.strokeStyle = 'rgba(255,255,255,' + 0.75 * (1 - p) + ')';
      g.lineWidth = Math.max(1, cell * 0.28 * (1 - p));
      g.beginPath(); g.arc(rg.x, rg.y, rg.maxR * (1 - Math.pow(1 - p, 3)), 0, 6.2832); g.stroke();
    }
    if (rings.length) rings = rings.filter((rg) => t - rg.t0 < rg.dur);

    if (flash > 0) {
      g.fillStyle = 'rgba(255,255,255,' + flash * 0.4 + ')';
      rr(g, 0, 0, size, size, cell * 0.2); g.fill();
      flash = Math.max(0, flash - dt * 2.6);
    }

    for (const p of pops) {
      const k = (t - p.t0) / p.dur;
      if (k >= 1) continue;
      const ease = 1 - Math.pow(1 - Math.min(k * 4, 1), 3);
      g.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      let y = p.y - k * cell * 0.9 - (p.lines.length - 1) * cell * 0.3;
      p.lines.forEach((ln) => {
        const fs = cell * 0.82 * ln.scale * (0.7 + 0.3 * ease);
        g.font = '700 ' + fs + 'px ' + DISPLAY;
        g.lineWidth = Math.max(4, fs * 0.2);
        g.strokeStyle = 'rgba(12,17,60,0.92)'; g.strokeText(ln.text, p.x, y);
        g.fillStyle = ln.color; g.fillText(ln.text, p.x, y);
        y += fs * 1.05;
      });
      g.globalAlpha = 1;
    }
    if (pops.length) pops = pops.filter((p) => t - p.t0 < p.dur);

    dirty = hadFx;
    requestAnimationFrame(frame);
  }

  /* ---------- settings window ---------- */
  function openSettings() {
    settingsEl.hidden = false;
    $('gear').setAttribute('aria-expanded', 'true');
    $('closeSettings').focus();
  }
  function closeSettings() {
    settingsEl.hidden = true;
    $('gear').setAttribute('aria-expanded', 'false');
  }
  function paintSound() { $('soundToggle').setAttribute('aria-checked', String(soundOn)); }
  function paintVib() {
    document.querySelectorAll('#vibSeg button').forEach((b) => b.setAttribute('aria-pressed', String(parseInt(b.dataset.v, 10) === vibLevel)));
  }
  $('gear').addEventListener('click', () => { audio(); openSettings(); });
  $('closeSettings').addEventListener('click', closeSettings);
  $('resume').addEventListener('click', closeSettings);
  settingsEl.addEventListener('pointerdown', (e) => { if (e.target === settingsEl) closeSettings(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !settingsEl.hidden) closeSettings(); });
  $('newgame').addEventListener('click', () => { audio(); closeSettings(); newGame(); });
  $('again').addEventListener('click', () => { audio(); newGame(); });
  $('soundToggle').addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('brickyard-sound', soundOn ? '1' : '0'); } catch (e) { /* ignore */ }
    paintSound();
    if (soundOn) { audio(); sfxPlace(); }
  });
  function paintHelp() { $('helpToggle').setAttribute('aria-checked', String(helpful)); }
  $('helpToggle').addEventListener('click', () => {
    helpful = !helpful;
    try { localStorage.setItem('brickyard-help', helpful ? '1' : '0'); } catch (e) { /* ignore */ }
    paintHelp();
  });
  document.querySelectorAll('#vibSeg button').forEach((b) => b.addEventListener('click', () => {
    vibLevel = parseInt(b.dataset.v, 10);
    try { localStorage.setItem('brickyard-vib', String(vibLevel)); } catch (e) { /* ignore */ }
    paintVib();
    buzz([40, 50, 40]);
  }));
  if (!canVibrate) {
    $('vibHint').hidden = false;
    $('vibHint').textContent = 'Vibration is not available in this browser. iPhone Safari does not allow it; most Android phones do.';
  }
  const themeGrid = $('themeGrid');
  function paintTheme() {
    themeGrid.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === themeId)));
    $('themeName').textContent = THEMES[themeId].name;
  }
  Object.keys(THEMES).forEach((id) => {
    const t = THEMES[id], b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.dataset.t = id; b.title = t.name; b.setAttribute('aria-label', t.name);
    b.style.background = 'linear-gradient(135deg,' + t.v.bg + ' 0 46%,' + t.c[0] + ' 46% 66%,' + t.c[2] + ' 66% 82%,' + t.c[4] + ' 82%)';
    b.addEventListener('click', () => {
      applyTheme(id);
      try { localStorage.setItem('brickyard-theme', id); } catch (e) { /* ignore */ }
      paintTheme();
      pulseAura(COLORS[4], 2);
    });
    themeGrid.appendChild(b);
  });
  paintSound(); paintVib(); paintHelp(); paintTheme();

  let resizeTimer = 0;
  const relayout = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!dragging) layout(); }, 150); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  /* keep iOS from scrolling or zooming while a piece is being dragged */
  document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });
  ['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
  document.addEventListener('contextmenu', (e) => { if (dragging) e.preventDefault(); });

  grid = Array.from({ length: N }, () => Array(N).fill(-1));
  tray = [];
  try { const th = localStorage.getItem('brickyard-theme'); if (th && THEMES[th]) themeId = th; } catch (e) { /* ignore */ }
  applyTheme(themeId);
  newGame();
  layout();
  buildTray(true);
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { try { layout(); } catch (e) { /* ignore */ } });
})();
