import { declination } from './wmm.js';
import * as A from './astro.js';
import { headingFromEuler, cameraAzimuth, cameraElevation, edgeElevation, angleDiff } from './orient.js';

const $ = (id) => document.getElementById(id);
const RAD = Math.PI / 180;
const store = {
  get(k, d) { try { const v = localStorage.getItem('worsley.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('worsley.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const S = {
  mag: null,        // magnetic heading of the phone (deg), raw
  camMag: null,     // magnetic bearing the rear camera looks along
  shown: null,      // smoothed display heading
  beta: 0, gamma: 0, haveTilt: false,
  compassAcc: null,
  pos: null,        // {lat, lon, alt, acc, speed, t}
  decl: null,       // magnetic variation, deg east
  useTrue: store.get('true', true),
  night: store.get('night', false),
  lock: null,       // locked bearing, stored as magnetic
  onBearing: false,
  mode: store.get('mode', 'cam'),
  ic: store.get('ic', { cam: 0, edge: 0 }),
  elev: null,       // smoothed raw sextant elevation
  sights: store.get('sights', []),
  revealed: false,
  tab: 'compass',
};

/* ---------------- formatting ---------------- */
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const point = (d) => POINTS[Math.round(A.norm360(d) / 22.5) % 16];
const pad = (n, w = 2) => String(n).padStart(w, '0');
function dm(deg, decimals = 0) {            // 34° 12′
  const neg = deg < 0; let a = Math.abs(deg);
  let d = Math.floor(a), m = (a - d) * 60;
  const f = 10 ** decimals; m = Math.round(m * f) / f;
  if (m >= 60) { m = 0; d += 1; }
  return `${neg ? '−' : ''}${d}° ${decimals ? m.toFixed(decimals).padStart(3 + decimals, '0') : pad(m)}′`;
}
const fmtLat = (v) => `${dm(Math.abs(v), 1)} ${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${dm(Math.abs(v), 1)} ${v >= 0 ? 'E' : 'W'}`;
const hhmm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const utc = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;

let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

/* ---------------- dial ---------------- */
function buildDial() {
  const p = [];
  p.push('<circle class="rim" r="204"/>');
  p.push('<g id="rose">');
  // eight-point rose
  for (let i = 0; i < 4; i++) p.push(`<polygon class="rose-b" transform="rotate(${45 + i * 90})" points="0,-78 9,-9 0,0 -9,-9"/>`);
  for (let i = 0; i < 4; i++) p.push(`<polygon class="${i === 0 ? 'rose-n' : 'rose-a'}" transform="rotate(${i * 90})" points="0,-104 13,-13 0,0 -13,-13"/>`);
  for (let d = 0; d < 360; d += 2) {
    const major = d % 30 === 0, mid = d % 10 === 0;
    const len = major ? 20 : mid ? 14 : 7;
    p.push(`<line class="tick${major ? ' major' : mid ? ' mid' : ''}" transform="rotate(${d})" y1="-200" y2="${-200 + len}"/>`);
  }
  for (let d = 0; d < 360; d += 30) {
    if (d % 90 === 0) continue;
    p.push(`<text class="num" transform="rotate(${d}) translate(0,-166)">${d}</text>`);
  }
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([c, d]) =>
    p.push(`<text class="card${c === 'N' ? ' n' : ''}" transform="rotate(${d}) translate(0,-160)">${c}</text>`));
  [['NE', 45], ['SE', 135], ['SW', 225], ['NW', 315]].forEach(([c, d]) =>
    p.push(`<text class="inter" transform="rotate(${d}) translate(0,-128)">${c}</text>`));
  p.push('<g id="sunmark" hidden><circle class="sun" cy="-204" r="8"/></g>');
  p.push('<g id="lockmark" hidden><polygon class="lockmark" points="0,-178 -10,-200 10,-200"/></g>');
  p.push('</g>');
  // fixed parts: lubber line and bubble level
  p.push('<polygon class="lubber" points="0,-196 -11,-220 11,-220"/>');
  p.push('<circle class="level-ring" r="30"/><line class="level-x" x1="-30" x2="30"/><line class="level-x" y1="-30" y2="30"/><circle class="level-ring" r="9" fill="none" style="fill:none"/>');
  p.push('<circle id="bubble" class="bubble" r="7"/>');
  $('dial').innerHTML = p.join('');
}

/* ---------------- sensors ---------------- */
let lastHeadingAt = 0;
function onOrient(e, absoluteEvent) {
  if (e.beta != null && e.gamma != null) { S.beta = e.beta; S.gamma = e.gamma; S.haveTilt = true; }
  const so = (screen.orientation && screen.orientation.angle) || 0;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    // iOS: already tilt-compensated magnetic heading
    S.mag = A.norm360(e.webkitCompassHeading + so);
    S.camMag = S.mag;
    S.compassAcc = e.webkitCompassAccuracy > 0 ? e.webkitCompassAccuracy : null;
    lastHeadingAt = Date.now();
  } else if ((absoluteEvent || e.absolute) && e.alpha != null) {
    S.mag = A.norm360(headingFromEuler(e.alpha, e.beta, e.gamma) + (Math.cos(e.beta * RAD) > 0.42 ? so : 0));
    S.camMag = cameraAzimuth(e.alpha, e.beta, e.gamma);
    lastHeadingAt = Date.now();
  }
}

async function start() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') toast('Motion access denied — the compass cannot work without it.');
    }
  } catch { /* not iOS */ }
  window.addEventListener('deviceorientationabsolute', (e) => onOrient(e, true));
  window.addEventListener('deviceorientation', (e) => onOrient(e, false));
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(onPosition, (err) => {
      if (!S.pos) $('pos').textContent = err.code === 1 ? 'Location off — magnetic north only' : 'No GPS fix yet';
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  } else $('pos').textContent = 'No location service on this device';
  keepAwake();
  $('start').hidden = true;
  setTimeout(() => { if (S.mag == null) $('north-label').textContent = 'NO COMPASS SENSOR FOUND'; }, 3500);
  requestAnimationFrame(frame);
  setInterval(slowTick, 1000); slowTick();
}

function onPosition(p) {
  const c = p.coords;
  const moved = !S.pos || A.distanceNm(S.pos.lat, S.pos.lon, c.latitude, c.longitude) > 5;
  S.pos = { lat: c.latitude, lon: c.longitude, alt: c.altitude, acc: c.accuracy, speed: c.speed, t: p.timestamp };
  if (moved || S.decl == null) S.decl = declination(c.latitude, c.longitude, (c.altitude || 0) / 1000, new Date());
  slowTick();
}

let wake = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch { /* unsupported */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && $('start').hidden) keepAwake(); });

/* ---------------- render loops ---------------- */
const trueOn = () => S.useTrue && S.decl != null;
const toDisplay = (mag) => A.norm360(mag + (trueOn() ? S.decl : 0));
let cardRot = 0;

function frame() {
  requestAnimationFrame(frame);
  if (S.tab === 'compass' && S.mag != null) {
    const target = toDisplay(S.mag);
    S.shown = S.shown == null ? target : A.norm360(S.shown + angleDiff(target, S.shown) * 0.18);
    cardRot += angleDiff(-S.shown, cardRot);
    $('rose').setAttribute('transform', `rotate(${cardRot.toFixed(2)})`);
    const h = Math.round(S.shown) % 360;
    $('hdg').textContent = `${h}°`;
    $('cardinal').textContent = point(S.shown);
    if (S.lock != null) {
      const off = angleDiff(toDisplay(S.lock), S.shown);
      const on = Math.abs(off) <= 2;
      const el = $('steer');
      el.textContent = on ? `On bearing ${Math.round(toDisplay(S.lock)) % 360}°` : `${off > 0 ? 'Turn right' : 'Turn left'} ${Math.abs(Math.round(off))}°  →  ${Math.round(toDisplay(S.lock)) % 360}°`;
      el.classList.toggle('on', on);
      if (on && !S.onBearing && navigator.vibrate) navigator.vibrate(30);
      S.onBearing = on;
    }
  }
  if (S.tab === 'compass' && S.haveTilt) {
    const k = 30 / 25; // 25 degrees of tilt reaches the ring
    let x = S.gamma * k, y = S.beta * k; const r = Math.hypot(x, y);
    if (r > 23) { x *= 23 / r; y *= 23 / r; }
    const b = $('bubble');
    b.setAttribute('cx', (-x).toFixed(1)); b.setAttribute('cy', (-y).toFixed(1));
    b.classList.toggle('flat', r < 2.4);
  }
  if (S.tab === 'sextant' && S.haveTilt) {
    const raw = S.mode === 'cam' ? cameraElevation(S.beta, S.gamma) : edgeElevation(S.beta);
    S.elev = S.elev == null ? raw : S.elev + (raw - S.elev) * 0.06;
    $('alt').textContent = dm(S.elev - S.ic[S.mode]);
  }
}

function slowTick() {
  $('north-label').textContent = S.mag == null ? $('north-label').textContent : trueOn() ? 'TRUE' : S.useTrue ? 'MAGNETIC (NO FIX YET)' : 'MAGNETIC';
  $('acc-label').textContent = S.compassAcc != null ? `±${Math.round(S.compassAcc)}°${S.compassAcc > 20 ? ' — CALIBRATE' : ''}` : '';
  const now = new Date();
  if (S.pos) {
    const p = S.pos;
    $('pos').textContent = `${fmtLat(p.lat)}   ${fmtLon(p.lon)}`;
    $('g-elev').textContent = p.alt != null ? `${Math.round(p.alt)} m` : '—';
    $('g-speed').textContent = p.speed != null && p.speed >= 0 ? `${(p.speed * 1.943844).toFixed(1)} kn` : '—';
    $('g-decl').textContent = `${Math.abs(S.decl).toFixed(1)}° ${S.decl >= 0 ? 'E' : 'W'}`;
    const sun = A.sunPosition(now, p.lat, p.lon);
    const up = sun.alt > -0.833;
    $('g-sun').textContent = up ? `${Math.round(sun.az) % 360}°` : 'set';
    const sm = $('sunmark');
    sm.toggleAttribute('hidden', !up);
    sm.setAttribute('transform', `rotate(${(sun.az - (trueOn() ? 0 : S.decl)).toFixed(1)})`);
    const t = A.sunTimes(now, p.lat, p.lon);
    const mins = Math.round((t.noon - now) / 6e4);
    const rel = Math.abs(mins) < 1 ? 'now' : mins > 0 ? `in ${Math.floor(mins / 60)}h ${pad(mins % 60)}m` : `${Math.floor(-mins / 60)}h ${pad(-mins % 60)}m ago`;
    const riseSet = t.polar ? (t.polar === 'day' ? 'Sun up all day' : 'Sun below horizon all day') : `Sunrise ${hhmm(t.rise)} · Sunset ${hhmm(t.set)}`;
    $('plan').innerHTML = `<h4>Plan your noon sight</h4>Local noon today <b>${hhmm(t.noon)}</b> (${rel})<br><span class="note">${riseSet}</span>`;
  }
  const lm = $('lockmark');
  lm.toggleAttribute('hidden', S.lock == null);
  if (S.lock != null) lm.setAttribute('transform', `rotate(${toDisplay(S.lock).toFixed(1)})`);
}

/* ---------------- compass controls ---------------- */
function syncChips() {
  $('btn-north').setAttribute('aria-pressed', S.useTrue);
  $('btn-north').textContent = S.useTrue ? 'True north' : 'Magnetic';
  $('btn-night').setAttribute('aria-pressed', S.night);
  $('btn-lock').setAttribute('aria-pressed', S.lock != null);
  $('btn-lock').textContent = S.lock != null ? 'Unlock' : 'Lock bearing';
  $('steer').hidden = S.lock == null;
  document.body.classList.toggle('night', S.night);
  document.querySelector('meta[name=theme-color]').content = S.night ? '#000000' : '#0b1622';
}
$('btn-north').onclick = () => { S.useTrue = !S.useTrue; store.set('true', S.useTrue); S.shown = null; syncChips(); slowTick(); };
$('btn-night').onclick = () => { S.night = !S.night; store.set('night', S.night); syncChips(); };
$('btn-lock').onclick = () => {
  if (S.lock != null) S.lock = null;
  else if (S.mag == null) return toast('No heading yet');
  else { S.lock = S.mag; S.onBearing = true; }
  syncChips(); slowTick();
};
$('pos').onclick = async () => {
  if (!S.pos) return;
  const txt = `${S.pos.lat.toFixed(6)}, ${S.pos.lon.toFixed(6)}`;
  try { await navigator.clipboard.writeText(txt); toast(`Copied ${txt}`); } catch { toast(txt); }
};

/* ---------------- tabs ---------------- */
document.querySelectorAll('.tabbar button').forEach((b) => {
  b.onclick = () => {
    S.tab = b.dataset.tab;
    document.querySelectorAll('.tabbar button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.id === 'tab-' + S.tab));
    if (S.tab !== 'sextant') stopCamera();
    S.elev = null;
  };
});

/* ---------------- sextant ---------------- */
let stream = null;
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('No camera access in this browser — use Edge mode');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const v = $('cam'); v.srcObject = stream; await v.play();
    $('btn-cam').hidden = true;
  } catch { toast('Camera unavailable — use Edge mode'); }
}
function stopCamera() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; $('cam').srcObject = null; }
  $('btn-cam').hidden = false;
}
$('btn-cam').onclick = startCamera;

function syncMode() {
  $('mode-cam').setAttribute('aria-pressed', S.mode === 'cam');
  $('mode-edge').setAttribute('aria-pressed', S.mode === 'edge');
  $('finder').classList.toggle('edge', S.mode === 'edge');
  $('edge-help').hidden = S.mode !== 'edge';
  $('btn-zero').setAttribute('aria-pressed', S.ic[S.mode] !== 0);
  $('btn-zero').textContent = S.ic[S.mode] !== 0 ? 'Zeroed' : 'Zero';
  S.elev = null;
}
$('mode-cam').onclick = () => { S.mode = 'cam'; store.set('mode', 'cam'); syncMode(); };
$('mode-edge').onclick = () => { S.mode = 'edge'; store.set('mode', 'edge'); stopCamera(); syncMode(); };
$('btn-zero').onclick = () => {
  if (S.ic[S.mode] !== 0) { S.ic[S.mode] = 0; toast('Index correction cleared'); }
  else if (S.elev == null) return toast('No tilt sensor reading yet');
  else if (Math.abs(S.elev) > 10) return toast('Aim at the horizon first — zero must be within 10° of level');
  else { S.ic[S.mode] = S.elev; toast(`Zero set (index correction ${dm(-S.elev)})`); }
  store.set('ic', S.ic); syncMode();
};

$('btn-sight').onclick = () => {
  if (S.elev == null) return toast('No tilt sensor reading — this device cannot take sights');
  const az = S.camMag == null || S.mode === 'edge' ? (S.mag == null ? null : toDisplay(S.mag)) : toDisplay(S.camMag);
  S.sights.push({
    t: Date.now(), hs: S.elev - S.ic[S.mode], ic: S.ic[S.mode], mode: S.mode, az,
    gps: S.pos ? { lat: S.pos.lat, lon: S.pos.lon } : null,
  });
  if (S.sights.length > 40) S.sights.shift();
  store.set('sights', S.sights);
  S.revealed = false;
  if (navigator.vibrate) navigator.vibrate(20);
  renderSights();
};
$('btn-clear').onclick = () => { S.sights = []; store.set('sights', S.sights); renderSights(); };

function reduce(s) {
  const when = new Date(s.t);
  const refr = A.refraction(s.hs) / 60;
  const ho = s.hs - refr;
  const { dec, eot } = A.sunEphem(when);
  const south = s.az == null ? true : Math.cos(s.az * RAD) < 0;
  const lat = A.latitudeFromNoon(ho, dec, south);
  return { when, refr, ho, dec, eot, south, lat, lon: A.longitudeFromNoon(when), latOk: Math.abs(lat) <= 90 };
}

function renderSights() {
  const out = $('sight-out'), n = S.sights.length;
  $('log-wrap').hidden = n === 0;
  if (!n) { out.innerHTML = ''; return; }
  // the noon sight is the highest of the series taken within the last 3 hours of the latest one
  const last = S.sights[n - 1];
  const series = S.sights.filter((s) => last.t - s.t < 3 * 3600e3);
  const peak = series.reduce((a, b) => (b.hs > a.hs ? b : a));
  const L = reduce(last), P = reduce(peak);
  const row = (k, v) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`;
  let h = `<div class="card"><h4>Latest sight</h4><table>
    ${row('Sextant altitude', dm(last.hs + last.ic))}
    ${row('Index correction', dm(-last.ic))}
    ${row('Refraction', `−${(L.refr * 60).toFixed(1)}′`)}
    <tr><td class="k">Observed altitude</td><td class="big">${dm(L.ho)}</td></tr>
    ${row('Time', utc(L.when))}
    ${row('Bearing', last.az == null ? '—' : `${Math.round(last.az) % 360}° ${point(last.az)}`)}
  </table></div>`;

  h += `<div class="card"><h4>If the Sun was at its noon peak</h4>`;
  if (peak.hs < 1 || !P.latOk) h += `<p class="note">That altitude can't be a noon Sun sight. Aim at the Sun and try again.</p>`;
  else {
    h += `<table>
      <tr><td class="k">Latitude</td><td class="big">${fmtLat(P.lat)}</td></tr>
      <tr><td class="k">Longitude</td><td class="big">${fmtLon(P.lon)}</td></tr>
      ${row('Sun declination', `${dm(Math.abs(P.dec), 1)} ${P.dec >= 0 ? 'N' : 'S'}`)}
      ${row('Equation of time', `${P.eot >= 0 ? '+' : '−'}${Math.abs(P.eot).toFixed(1)} min`)}
    </table>
    <p class="note">Uses the highest of your ${series.length} recent sight${series.length > 1 ? 's' : ''} (${dm(peak.hs)} at ${utc(P.when)}), Sun bearing ${P.south ? 'south' : 'north'}. Latitude from the altitude, longitude from the time. Only valid if that sight caught the Sun at its highest.</p>`;
  }
  h += `</div>`;

  if (L.ho > 0 && L.ho < 90) h += `<div class="card"><h4>If that was Polaris</h4><table><tr><td class="k">Latitude ≈</td><td class="big">${dm(L.ho)} N</td></tr></table><p class="note">Polaris circles the pole at about ¾°, so this is good to within that.</p></div>`;

  if (!S.revealed) h += `<button class="btn" id="btn-reveal">Check against GPS</button>`;
  else if (!last.gps) h += `<div class="card"><h4>GPS check</h4><p class="note">No GPS fix was available when you took that sight.</p></div>`;
  else {
    const g = last.gps, truth = A.sunPosition(L.when, g.lat, g.lon);
    const diff = (L.ho - truth.alt) * 60;
    const aimed = last.az == null || Math.abs(angleDiff(last.az, truth.az)) < 30;
    h += `<div class="card"><h4>GPS check</h4><table>
      ${row('GPS position', `${fmtLat(g.lat)}<br>${fmtLon(g.lon)}`)}
      ${row('Sun was really at', `${dm(truth.alt)}, bearing ${Math.round(truth.az) % 360}°`)}`;
    if (aimed && truth.alt > 0) {
      h += `<tr><td class="k">Your altitude error</td><td class="big ${Math.abs(diff) < 45 ? 'good' : ''}">${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(0)}′</td></tr></table>
        <p class="note">One arcminute is one nautical mile, so this sight puts you about ${Math.abs(diff).toFixed(0)} nm off.</p>`;
    } else h += `</table><p class="note">You weren't aimed at the Sun (or it's below the horizon), so there's no altitude to compare.</p>`;
    if (peak.gps && P.latOk && peak.hs >= 1) {
      const noon = A.sunTimes(P.when, peak.gps.lat, peak.gps.lon).noon;
      const off = Math.round((P.when - noon) / 6e4);
      const d = A.distanceNm(P.lat, P.lon, peak.gps.lat, peak.gps.lon);
      h += Math.abs(off) <= 15
        ? `<p class="note">Noon fix was <b>${d.toFixed(0)} nm</b> from your GPS position (sight taken ${Math.abs(off)} min ${off < 0 ? 'before' : 'after'} local noon).</p>`
        : `<p class="note">Your best sight was ${Math.floor(Math.abs(off) / 60)}h ${pad(Math.abs(off) % 60)}m ${off < 0 ? 'before' : 'after'} local noon, so the noon fix above doesn't apply (it's ${d.toFixed(0)} nm out).</p>`;
    }
    h += `</div>`;
  }
  out.innerHTML = h;
  const rb = $('btn-reveal'); if (rb) rb.onclick = () => { S.revealed = true; renderSights(); };

  $('log').innerHTML = S.sights.slice().reverse().map((s) =>
    `<li class="${s === peak ? 'peak' : ''}"><span>${dm(s.hs)}${s === peak ? ' ▲' : ''}</span><span>${utc(new Date(s.t))}${s.az != null ? ` · ${Math.round(s.az) % 360}°` : ''}</span></li>`).join('');
}

/* ---------------- boot ---------------- */
buildDial();
syncChips();
syncMode();
renderSights();
$('btn-start').onclick = start;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
